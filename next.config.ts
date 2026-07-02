import type { NextConfig } from "next";
import os from "os";

const localIPs = Object.values(os.networkInterfaces())
  .flat()
  .filter((iface): iface is os.NetworkInterfaceInfo =>
    iface !== undefined && iface.family === "IPv4" && !iface.internal
  )
  .map((iface) => iface.address);

const nextConfig: NextConfig = {
  reactCompiler: true,
  allowedDevOrigins: localIPs,
};

export default nextConfig;
