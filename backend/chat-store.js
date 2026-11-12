const { Pool } = require('pg');

class ChatStore {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
    });
    this.pool.on('error', (error) => {
      console.error('PostgreSQL connection error:', error.message);
    });
  }

  async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS prison_players (
        id uuid PRIMARY KEY,
        inmate_number bigserial UNIQUE NOT NULL,
        session_token_hash char(64) UNIQUE NOT NULL,
        session_expires_at timestamptz NOT NULL,
        name varchar(28) NOT NULL,
        age smallint NOT NULL CHECK (age BETWEEN 18 AND 99),
        offense varchar(60) NOT NULL,
        reason varchar(140) NOT NULL,
        role varchar(16) NOT NULL DEFAULT 'player'
          CHECK (role IN ('player', 'moderator', 'administrator')),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS prison_chat_messages (
        id uuid PRIMARY KEY,
        sender_id uuid NOT NULL REFERENCES prison_players(id),
        receiver_id uuid REFERENCES prison_players(id),
        room_id varchar(64) NOT NULL,
        message_type varchar(16) NOT NULL
          CHECK (message_type IN ('global', 'near', 'private')),
        content varchar(500) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz,
        CHECK ((message_type = 'private' AND receiver_id IS NOT NULL)
          OR (message_type <> 'private' AND receiver_id IS NULL))
      );

      CREATE TABLE IF NOT EXISTS prison_chat_deliveries (
        message_id uuid NOT NULL REFERENCES prison_chat_messages(id) ON DELETE CASCADE,
        recipient_id uuid NOT NULL REFERENCES prison_players(id) ON DELETE CASCADE,
        PRIMARY KEY (message_id, recipient_id)
      );

      CREATE TABLE IF NOT EXISTS prison_chat_blocks (
        blocker_id uuid NOT NULL REFERENCES prison_players(id) ON DELETE CASCADE,
        blocked_id uuid NOT NULL REFERENCES prison_players(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (blocker_id, blocked_id),
        CHECK (blocker_id <> blocked_id)
      );

      CREATE TABLE IF NOT EXISTS prison_chat_reports (
        id uuid PRIMARY KEY,
        reporter_id uuid NOT NULL REFERENCES prison_players(id),
        message_id uuid NOT NULL REFERENCES prison_chat_messages(id) ON DELETE CASCADE,
        status varchar(16) NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'reviewed', 'dismissed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (reporter_id, message_id)
      );

      CREATE INDEX IF NOT EXISTS prison_chat_room_history_idx
        ON prison_chat_messages (room_id, message_type, created_at DESC);
      CREATE INDEX IF NOT EXISTS prison_chat_private_history_idx
        ON prison_chat_messages (sender_id, receiver_id, created_at DESC)
        WHERE message_type = 'private';
      CREATE INDEX IF NOT EXISTS prison_chat_delivery_history_idx
        ON prison_chat_deliveries (recipient_id, message_id);
    `);
  }

  async createGuestPlayer({ id, sessionTokenHash, sessionExpiresAt, profile }) {
    const result = await this.pool.query(
      `INSERT INTO prison_players
        (id, session_token_hash, session_expires_at, name, age, offense, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, inmate_number, name, age, offense, reason, role`,
      [id, sessionTokenHash, sessionExpiresAt, profile.name, profile.age, profile.offense, profile.reason],
    );
    return this.mapPlayer(result.rows[0]);
  }

  async findPlayerBySessionTokenHash(sessionTokenHash) {
    const result = await this.pool.query(
      `SELECT id, inmate_number, name, age, offense, reason, role
       FROM prison_players
       WHERE session_token_hash = $1 AND session_expires_at > now()`,
      [sessionTokenHash],
    );
    return result.rows[0] ? this.mapPlayer(result.rows[0]) : null;
  }

  async updateProfile(playerId, profile) {
    await this.pool.query(
      `UPDATE prison_players
       SET name = $2, age = $3, offense = $4, reason = $5
       WHERE id = $1`,
      [playerId, profile.name, profile.age, profile.offense, profile.reason],
    );
  }

  async insertMessage({ id, senderId, receiverId, roomId, type, content, recipients = [] }) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO prison_chat_messages
          (id, sender_id, receiver_id, room_id, message_type, content)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, sender_id, receiver_id, room_id, message_type, content, created_at`,
        [id, senderId, receiverId, roomId, type, content],
      );
      if (type === 'near' && recipients.length) {
        await client.query(
          `INSERT INTO prison_chat_deliveries (message_id, recipient_id)
           SELECT $1, recipients.recipient_id
           FROM unnest($2::uuid[]) AS recipients(recipient_id)
           ON CONFLICT DO NOTHING`,
          [id, recipients],
        );
      }
      await client.query('COMMIT');
      return this.mapMessage(result.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getHistory({ playerId, peerId, roomId, type, before, limit }) {
    let visibility;
    let parameters;
    if (type === 'private') {
      visibility = `m.message_type = 'private'
        AND ((m.sender_id = $1 AND m.receiver_id = $2)
          OR (m.sender_id = $2 AND m.receiver_id = $1))`;
      parameters = [playerId, peerId];
    } else if (type === 'near') {
      visibility = `m.message_type = 'near' AND EXISTS (
        SELECT 1 FROM prison_chat_deliveries d
        WHERE d.message_id = m.id AND d.recipient_id = $1
      )`;
      parameters = [playerId];
    } else {
      visibility = `m.message_type = 'global' AND m.room_id = $1`;
      parameters = [roomId];
    }

    const beforeIndex = parameters.length + 1;
    const limitIndex = parameters.length + 2;
    const result = await this.pool.query(
      `SELECT m.id, m.sender_id, p.name AS sender_name, p.inmate_number AS sender_inmate_number,
          m.receiver_id, m.room_id, m.message_type, m.content, m.created_at, m.deleted_at
       FROM prison_chat_messages m
       JOIN prison_players p ON p.id = m.sender_id
       WHERE ${visibility}
         AND ($${beforeIndex}::timestamptz IS NULL OR m.created_at < $${beforeIndex})
       ORDER BY m.created_at DESC
       LIMIT $${limitIndex}`,
      [...parameters, before || null, limit],
    );
    return result.rows.reverse().map((row) => this.mapMessage(row));
  }

  async getBlockedIds(playerId) {
    const result = await this.pool.query(
      'SELECT blocked_id FROM prison_chat_blocks WHERE blocker_id = $1',
      [playerId],
    );
    return result.rows.map((row) => row.blocked_id);
  }

  async setBlocked(blockerId, blockedId, blocked) {
    if (blocked) {
      await this.pool.query(
        `INSERT INTO prison_chat_blocks (blocker_id, blocked_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [blockerId, blockedId],
      );
      return;
    }
    await this.pool.query(
      'DELETE FROM prison_chat_blocks WHERE blocker_id = $1 AND blocked_id = $2',
      [blockerId, blockedId],
    );
  }

  async deleteOwnMessage(playerId, messageId) {
    const result = await this.pool.query(
      `UPDATE prison_chat_messages
       SET content = '', deleted_at = now()
       WHERE id = $1 AND sender_id = $2 AND deleted_at IS NULL
       RETURNING id, sender_id, receiver_id, room_id, message_type, content, created_at, deleted_at`,
      [messageId, playerId],
    );
    return result.rows[0] ? this.mapMessage(result.rows[0]) : null;
  }

  async getNearRecipients(messageId) {
    const result = await this.pool.query(
      'SELECT recipient_id FROM prison_chat_deliveries WHERE message_id = $1',
      [messageId],
    );
    return result.rows.map((row) => row.recipient_id);
  }

  async reportMessage(reporterId, messageId) {
    const result = await this.pool.query(
      `INSERT INTO prison_chat_reports (id, reporter_id, message_id)
       SELECT $1, $2, m.id
       FROM prison_chat_messages m
       WHERE m.id = $3 AND (
         m.message_type = 'global'
         OR (m.message_type = 'private' AND (m.sender_id = $2 OR m.receiver_id = $2))
         OR (m.message_type = 'near' AND EXISTS (
           SELECT 1 FROM prison_chat_deliveries d
           WHERE d.message_id = m.id AND d.recipient_id = $2
         ))
       )
       ON CONFLICT (reporter_id, message_id) DO NOTHING
       RETURNING id`,
      [require('node:crypto').randomUUID(), reporterId, messageId],
    );
    return result.rowCount === 1;
  }

  mapPlayer(row) {
    return {
      id: row.id,
      inmateNumber: Number(row.inmate_number),
      name: row.name,
      age: row.age,
      offense: row.offense,
      reason: row.reason,
      role: row.role,
    };
  }

  mapMessage(row) {
    return {
      id: row.id,
      senderId: row.sender_id,
      senderName: row.sender_name,
      senderInmateCode: row.sender_inmate_number === undefined
        ? undefined
        : `PR${String(row.sender_inmate_number).padStart(3, '0')}`,
      receiverId: row.receiver_id,
      roomId: row.room_id,
      type: row.message_type,
      content: row.deleted_at ? '' : row.content,
      deleted: Boolean(row.deleted_at),
      createdAt: row.created_at,
    };
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = { ChatStore };