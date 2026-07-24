import { ImageResponse } from "next/og";
import { TMark } from "./_brand/tmark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#fdfaf2",
          borderRadius: 7,
        }}
      >
        <TMark size={22} />
      </div>
    ),
    { ...size },
  );
}
