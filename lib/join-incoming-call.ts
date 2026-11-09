type IncomingCall = {
  type: string;
  join: () => Promise<unknown>;
  camera: { enable: () => Promise<unknown> };
};

export async function joinIncomingCall(call: IncomingCall): Promise<string> {
  await call.join();
  if (call.type === "audio_call") return "";

  try {
    await call.camera.enable();
    return "";
  } catch (error) {
    console.error("Unable to enable camera for incoming call", error);
    return "You joined without video. Allow camera access, then turn on your camera.";
  }
}
