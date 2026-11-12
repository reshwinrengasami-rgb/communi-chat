export type Appearance = {
  buttonSize: "small" | "normal" | "large";
  bubbleColor: string;
  backgroundColor: string;
  backgroundPhoto: string;
};

export const defaultAppearance: Appearance = {
  buttonSize: "normal",
  bubbleColor: "#10b981",
  backgroundColor: "#11121a",
  backgroundPhoto: "",
};

export function contrastTextColor(color: string): "#000000" | "#ffffff" {
  const channels = [1, 3, 5].map((offset) => {
    const channel = parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2] > 0.179
    ? "#000000"
    : "#ffffff";
}

export function isAppearance(value: unknown): value is Appearance {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    (data.buttonSize === "small" || data.buttonSize === "normal" || data.buttonSize === "large") &&
    typeof data.bubbleColor === "string" && /^#[0-9a-f]{6}$/i.test(data.bubbleColor) &&
    typeof data.backgroundColor === "string" && /^#[0-9a-f]{6}$/i.test(data.backgroundColor) &&
    typeof data.backgroundPhoto === "string" &&
    data.backgroundPhoto.length <= 400000 &&
    (data.backgroundPhoto === "" || /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i.test(data.backgroundPhoto))
  );
}
