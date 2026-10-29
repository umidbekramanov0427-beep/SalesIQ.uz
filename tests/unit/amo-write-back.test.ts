import { DEFAULT_WRITE_BACK, readWriteBack, toStored } from "@/lib/amocrm/write-back";

describe("amoCRM write-back settings", () => {
  it("keeps today's behaviour when nothing is stored", () => {
    expect(readWriteBack(null)).toEqual(DEFAULT_WRITE_BACK);
    expect(readWriteBack({ client_id: "x" })).toEqual(DEFAULT_WRITE_BACK);
  });

  it("round-trips what an admin saves", () => {
    const stored = toStored({
      task: false,
      taskDueHours: 4,
      note: true,
      noteClient: false,
      noteOutcome: true,
    });
    expect(readWriteBack({ write_back: stored })).toEqual({
      task: false,
      taskDueHours: 4,
      note: true,
      noteClient: false,
      noteOutcome: true,
    });
  });

  it("ignores junk", () => {
    const stored = toStored({ task: "no", taskDueHours: -3, note: 1 } as never);
    expect(readWriteBack({ write_back: stored })).toEqual(DEFAULT_WRITE_BACK);
    expect(readWriteBack({ write_back: { task_due_hours: 99999 } }).taskDueHours).toBe(24);
  });
});
