import './styles.css';
import { Game } from './game/Game.js';
import { ChatPanel } from './game/ChatPanel.js';

const canvas = document.querySelector('#game-canvas');
const bootMessage = document.querySelector('#boot-message');
const intakeScreen = document.querySelector('#profile-intake');
const reviewScreen = document.querySelector('#profile-review');
const gameHud = document.querySelector('#game-hud');
const pauseScreen = document.querySelector('#pause-screen');
const profileModal = document.querySelector('#player-profile-modal');
const errorMessage = document.querySelector('#error-message');
const toast = document.querySelector('#toast');
const profileForm = document.querySelector('#profile-form');
const profileError = document.querySelector('#profile-error');
const profileConnectError = document.querySelector('#profile-connect-error');
const offenseSelect = document.querySelector('#profile-offense');
const customOffenseField = document.querySelector('#custom-offense-field');
const customOffenseInput = document.querySelector('#custom-offense');
let profileStage = 'intake';
let profileDraft = null;
let game;
let chatPanel;

function showState(state) {
  bootMessage.hidden = true;
  intakeScreen.hidden = state !== 'menu' || profileStage !== 'intake';
  reviewScreen.hidden = state !== 'menu' || profileStage !== 'review';
  gameHud.hidden = state !== 'playing';
  pauseScreen.hidden = state !== 'paused';
  chatPanel?.setVisible(state === 'playing' || state === 'paused');
}

function showReview(profile) {
  document.querySelector('#review-name').textContent = profile.name;
  document.querySelector('#review-code').textContent = profile.inmateCode || 'CẤP KHI VÀO PHIÊN';
  document.querySelector('#review-age').textContent = `${profile.age} tuổi`;
  document.querySelector('#review-offense').textContent = profile.offense;
  document.querySelector('#review-reason').textContent = profile.reason;
}

function showPlayerProfile(profile) {
  document.querySelector('#player-profile-name').textContent = profile.name;
  document.querySelector('#player-profile-code').textContent = `${profile.inmateCode} · ${profile.connected ? 'ĐANG Ở TRONG PHIÊN' : 'MẤT KẾT NỐI'}`;
  document.querySelector('#player-profile-age').textContent = `${profile.age} tuổi`;
  document.querySelector('#player-profile-status').textContent = profile.connected ? 'Đang chơi' : 'Đang kết nối lại';
  document.querySelector('#player-profile-offense').textContent = profile.offense;
  document.querySelector('#player-profile-reason').textContent = profile.reason;
  profileModal.hidden = false;
}

try {
  game = await Game.create(canvas, showState, showPlayerProfile);
  chatPanel = new ChatPanel(game.multiplayer.socket);

  try {
    const savedProfile = JSON.parse(sessionStorage.getItem('prison-life-profile') || 'null');
    if (savedProfile) {
      document.querySelector('#profile-name').value = savedProfile.name || '';
      document.querySelector('#profile-age').value = savedProfile.age || 25;
      const hasPresetOffense = [...offenseSelect.options].some((option) => option.value === savedProfile.offense);
      offenseSelect.value = hasPresetOffense ? savedProfile.offense : 'Khác';
      customOffenseField.hidden = hasPresetOffense;
      customOffenseInput.required = !hasPresetOffense;
      customOffenseInput.value = hasPresetOffense ? '' : savedProfile.offense || '';
      document.querySelector('#profile-reason').value = savedProfile.reason || '';
    }
  } catch {
    profileDraft = null;
  }

  profileForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!profileForm.reportValidity()) return;
    const formData = new FormData(profileForm);
    const name = String(formData.get('name')).trim();
    const reason = String(formData.get('reason')).trim();
    const selectedOffense = String(formData.get('offense'));
    const customOffense = String(formData.get('customOffense') || '').trim();
    const offense = selectedOffense === 'Khác' ? customOffense : selectedOffense;
    if (name.length < 2 || !reason || !offense) {
      profileError.textContent = 'Hãy nhập tên, vi phạm và lý do nhập vai.';
      profileError.hidden = false;
      return;
    }
    profileDraft = {
      name,
      age: Number(formData.get('age')),
      offense,
      reason,
    };
    profileError.hidden = true;
    profileStage = 'review';
    showReview(profileDraft);
    showState('menu');
  });

  offenseSelect.addEventListener('change', () => {
    const customSelected = offenseSelect.value === 'Khác';
    customOffenseField.hidden = !customSelected;
    customOffenseInput.required = customSelected;
    if (!customSelected) customOffenseInput.value = '';
  });

  document.querySelector('#edit-profile-button').addEventListener('click', () => {
    profileConnectError.hidden = true;
    profileStage = 'intake';
    showState('menu');
  });

  document.querySelector('#begin-prison-button').addEventListener('click', async (event) => {
    if (!profileDraft) return;
    const button = event.currentTarget;
    const label = button.querySelector('span:nth-child(2)');
    button.disabled = true;
    label.textContent = 'ĐANG TIẾP NHẬN...';
    profileConnectError.hidden = true;
    try {
      await game.enterPrison(profileDraft);
      button.disabled = false;
      label.textContent = 'BẮT ĐẦU VÀO TÙ';
    } catch (error) {
      profileConnectError.textContent = error.message || 'Không thể vào phiên nhà tù.';
      profileConnectError.hidden = false;
      button.disabled = false;
      label.textContent = 'BẮT ĐẦU VÀO TÙ';
    }
  });

  document.querySelector('#resume-button').addEventListener('click', () => game.play());
  document.querySelector('#return-menu-button').addEventListener('click', () => game.returnToMenu());
  document.querySelector('#close-player-profile').addEventListener('click', () => {
    profileModal.hidden = true;
  });
  document.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && !profileModal.hidden) profileModal.hidden = true;
  });
  document.querySelector('#fullscreen-button').addEventListener('click', async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await game.gameShell.requestFullscreen();
      }
    } catch {
      toast.textContent = 'Trình duyệt không cho phép chế độ toàn màn hình.';
      toast.hidden = false;
      window.setTimeout(() => { toast.hidden = true; }, 2400);
    }
  });
} catch (error) {
  bootMessage.hidden = true;
  errorMessage.textContent = error.message || 'Không thể khởi tạo game 3D trên trình duyệt này.';
  errorMessage.hidden = false;
  console.error(error);
}