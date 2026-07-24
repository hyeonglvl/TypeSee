import { ImageResponse } from "next/og";
import { TMark } from "./_brand/tmark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      // iOS가 자체적으로 코너를 마스킹하므로 배경은 꽉 채우고 opaque 하게 둔다.
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fdfaf2",
        }}
      >
        <TMark size={112} />
      </div>
    ),
    { ...size },
  );
}
