import type { RawTouchFrame, TouchSlot, GestureEvent } from "./types";

// Mapping from Linux key codes to AutoMobile button names
const KEY_TO_BUTTON: Record<string, GestureEvent["button"]> = {
  KEY_BACK: "back",
  KEY_HOME: "home",
  KEY_MENU: "menu",
  KEY_POWER: "power",
  KEY_VOLUMEUP: "volume_up",
  KEY_VOLUMEDOWN: "volume_down",
  KEY_APPSELECT: "recent",
};

/**
 * State machine that processes `getevent -lt` text output one line at a time
 * and emits RawTouchFrame snapshots on SYN_REPORT events.
 *
 * Implements Linux Multi-Touch Protocol B (slot-based, stateful).
 *
 * Returns:
 *   - RawTouchFrame on EV_SYN SYN_REPORT (value 0x00000000)
 *   - GestureEvent { type: "pressButton" } on EV_KEY KEY_* DOWN
 *   - null for all other input lines
 */
export class TouchFrameReconstructor {
  private slots: Map<number, TouchSlot> = new Map();
  private currentSlot = 0;

  /**
   * Feed one text line from `getevent -lt` stdout.
   *
   * Line format: "[ 78826.389007] EV_ABS    ABS_MT_POSITION_X    000001a4"
   */
  feedLine(line: string, arrivedAt: number): RawTouchFrame | GestureEvent | null {
    // Match: "[timestamp] EV_TYPE   EVENT_CODE   value"
    const match = line.match(/^\[\s*[\d.]+\]\s+(\S+)\s+(\S+)\s+(\S+)\s*$/);
    if (!match) {return null;}

    const evType = match[1];
    const evCode = match[2];
    const evValue = match[3];

    if (evType === "EV_ABS") {
      this.handleAbsEvent(evCode, evValue);
      return null;
    }

    if (evType === "EV_SYN") {
      return this.handleSynEvent(evCode, evValue, arrivedAt);
    }

    if (evType === "EV_KEY" && evValue === "DOWN") {
      const button = KEY_TO_BUTTON[evCode];
      if (button) {
        return { type: "pressButton", arrivedAt, button };
      }
    }

    return null;
  }

  private handleAbsEvent(evCode: string, evValue: string): void {
    const value = parseInt(evValue, 16);

    switch (evCode) {
      case "ABS_MT_SLOT":
        this.currentSlot = value;
        break;

      case "ABS_MT_TRACKING_ID":
        if (evValue === "ffffffff") {
          // Finger lifted — mark slot as released
          const slot = this.slots.get(this.currentSlot);
          if (slot) {
            slot.trackingId = -1;
          }
        } else {
          // New or continuing contact
          const existing = this.slots.get(this.currentSlot);
          if (existing) {
            existing.trackingId = value;
          } else {
            this.slots.set(this.currentSlot, {
              slotId: this.currentSlot,
              trackingId: value,
              x: 0,
              y: 0,
              pressure: 0,
            });
          }
        }
        break;

      case "ABS_MT_POSITION_X":
        this.getOrCreateSlot().x = value;
        break;

      case "ABS_MT_POSITION_Y":
        this.getOrCreateSlot().y = value;
        break;

      case "ABS_MT_PRESSURE":
        this.getOrCreateSlot().pressure = value;
        break;

      default:
        break;
    }
  }

  private handleSynEvent(
    evCode: string,
    evValue: string,
    arrivedAt: number
  ): RawTouchFrame | null {
    if (evCode !== "SYN_REPORT") {return null;}

    // value 0x00000000 = SYN_REPORT (Protocol B)
    // value 0x00000002 = SYN_MT_REPORT (Protocol A, ignored)
    const value = parseInt(evValue, 16);
    if (value !== 0) {return null;}

    const activeSlots: TouchSlot[] = [];
    const releasedSlots: number[] = [];

    for (const [, slot] of this.slots) {
      if (slot.trackingId >= 0) {
        activeSlots.push({ ...slot });
      } else {
        releasedSlots.push(slot.slotId);
      }
    }

    // Remove released slots from state so they don't appear in future frames
    for (const slotId of releasedSlots) {
      this.slots.delete(slotId);
    }

    return { arrivedAt, activeSlots, releasedSlots };
  }

  private getOrCreateSlot(): TouchSlot {
    if (!this.slots.has(this.currentSlot)) {
      this.slots.set(this.currentSlot, {
        slotId: this.currentSlot,
        trackingId: -1,
        x: 0,
        y: 0,
        pressure: 0,
      });
    }
    return this.slots.get(this.currentSlot)!;
  }
}
