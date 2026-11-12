const preventedKeys = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor() {
    this.held = new Set();
    this.pressed = new Set();
    this.virtualHeld = new Set();
    this.virtualPressed = new Set();
    this.virtualMove = { x: 0, y: 0 };
    this.enabled = false;

    window.addEventListener('keydown', (event) => {
      const target = event.target;
      const isFormField = target instanceof HTMLElement
        && (target.isContentEditable || target.matches('input, textarea, select'));
      if (!this.enabled || isFormField) return;
      if (preventedKeys.has(event.code)) event.preventDefault();
      if (!event.repeat) this.pressed.add(event.code);
      this.held.add(event.code);
    });
    window.addEventListener('keyup', (event) => {
      this.held.delete(event.code);
    });
    window.addEventListener('blur', () => this.clear());
  }

  isDown(code) {
    if (!this.enabled) return false;
    if (this.held.has(code) || this.virtualHeld.has(code)) return true;
    if (code === 'KeyW') return this.virtualMove.y < -0.18;
    if (code === 'KeyS') return this.virtualMove.y > 0.18;
    if (code === 'KeyA') return this.virtualMove.x < -0.18;
    if (code === 'KeyD') return this.virtualMove.x > 0.18;
    return false;
  }

  consumePress(code) {
    const wasPressed = this.enabled && (this.pressed.has(code) || this.virtualPressed.has(code));
    this.pressed.delete(code);
    this.virtualPressed.delete(code);
    return wasPressed;
  }

  setVirtualMove(x, y) {
    this.virtualMove.x = x;
    this.virtualMove.y = y;
  }

  pressVirtual(code) {
    if (!this.virtualHeld.has(code)) this.virtualPressed.add(code);
    this.virtualHeld.add(code);
  }

  releaseVirtual(code) {
    this.virtualHeld.delete(code);
  }

  clear() {
    this.held.clear();
    this.pressed.clear();
    this.virtualHeld.clear();
    this.virtualPressed.clear();
    this.virtualMove.x = 0;
    this.virtualMove.y = 0;
  }
}