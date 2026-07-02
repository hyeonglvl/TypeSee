import os from "os";
import { spawn } from "child_process";

const ip =
  Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i?.family === "IPv4" && !i.internal)?.address ?? "0.0.0.0";

spawn("next", ["dev", "-H", "0.0.0.0"], { stdio: "inherit", shell: true });
