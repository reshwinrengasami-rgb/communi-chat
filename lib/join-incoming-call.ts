type IncomingCall = {
  type: string;
  state: { custom: Record<string, unknown> };
  join: () => Promise<unknown>;
  camera: { enable: () => Promise<unknown>; disable: () => Promise<unknown> };
  microphone: { enable: () => Promise<unknown> };
};

export async function joinIncomingCall(call: IncomingCall): Promise<string> {
  const audioOnly = call.type === "audio_call" || call.state.custom.audioOnly === true;
  if (audioOnly) await call.camera.disable();
  await call.join();
  const warnings: string[] = [];
  try {
    await call.microphone.enable();
  } catch (error) {
    console.error("Unable to enable microphone for call", error);
    warnings.push("Microphone unavailable. Allow microphone access and use the microphone button to retry.");
  }
  if (!audioOnly) {
    try {
      await call.camera.enable();
    } catch (error) {
      console.error("Unable to enable camera for call", error);
      warnings.push("You joined without video. Allow camera access, then turn on your camera.");
    }
  }
  return warnings.join(" ");
}
