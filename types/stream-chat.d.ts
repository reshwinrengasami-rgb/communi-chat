import "stream-chat";

declare module "stream-chat" {
  interface CustomChannelData {
    name?: string;
    is_group?: boolean;
  }
}
