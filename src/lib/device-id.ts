const DEVICE_KEY = "salesiq.deviceId";

// A stable id for this browser, so the sign-in list can group by device
// and mark "this device".
export function currentDeviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}
