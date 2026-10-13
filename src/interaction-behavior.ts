export class BlinkBehavior {
  static readonly HOLD_DURATION_MS = 140;
  static readonly POINTER_EYE_PRESS_RADIUS_PX = 90;
  private static readonly AVERAGE_INTERVAL_MS = 4000;
  private static readonly INTERVAL_VARIANCE_MS = 1500;

  static getIntervalMs(randomValue: number = Math.random()): number {
    return this.AVERAGE_INTERVAL_MS + (randomValue - 0.5) * this.INTERVAL_VARIANCE_MS;
  }

  static isPointerNearEyes(
    pointer: { clientX: number; clientY: number },
    eyes: { x: number; y: number }[],
    scale: number
  ): boolean {
    const radius = this.POINTER_EYE_PRESS_RADIUS_PX * scale;
    return eyes.some(
      (eye) => Math.hypot(pointer.clientX - eye.x, pointer.clientY - eye.y) <= radius
    );

  }
}

interface ManualBlinkOptions {
  blink: () => void;
  restore: () => void;
  setTimeout: (callback: () => void, delay: number) => number;
  clearTimeout: (timer: number) => void;
  now: () => number;
}

export class ManualBlinkController {
  private readonly options: ManualBlinkOptions;
  private timer: number | undefined;
  private pointerId: number | null = null;
  private startedAt = 0;
  private heldNearEyes = false;

  constructor(options: ManualBlinkOptions) {
    this.options = options;
  }

  pointerDown(id: number, nearEyes: boolean): void {
    this.clearTimer();
    this.pointerId = id;
    this.startedAt = this.options.now();
    this.heldNearEyes = nearEyes;
    this.options.blink();
    if (!this.heldNearEyes) {
      this.timer = this.options.setTimeout(() => this.finish(), BlinkBehavior.HOLD_DURATION_MS);
    }
  }

  pointerUp(id: number): void {
    if (id !== this.pointerId || (!this.heldNearEyes && this.timer !== undefined)) {
      return;
    }

    this.clearTimer();
    this.timer = this.options.setTimeout(
      () => this.finish(),
      Math.max(0, BlinkBehavior.HOLD_DURATION_MS - (this.options.now() - this.startedAt))
    );

  }

  cancel(): void {
    this.clearTimer();
    this.pointerId = null;
  }

  isActive(): boolean {
    return this.pointerId !== null;
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      this.options.clearTimeout(this.timer);
    }
    this.timer = undefined;
  }

  private finish(): void {
    this.timer = undefined;
    this.pointerId = null;
    this.options.restore();
  }
}
