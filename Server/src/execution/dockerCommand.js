// Each run gets its own named container: no network, capped memory, CPU and
// process count, and no privilege escalation. The job folder is mounted as
// the working directory.
//
// The command is an argument list passed to spawn without a shell, so nothing
// in a path or name is ever interpreted by a shell. The name is what lets the
// runner stop the container itself when a run times out.
const IMAGES = {
  java: ["eclipse-temurin:17", "sh", "-c", "javac Main.java && java Main"],
  python: ["python:3", "python", "Main.py"],
  cpp: ["gcc", "sh", "-c", "g++ Main.cpp -o a.out && ./a.out"]
}

export const FILE_NAMES = { java: "Main.java", python: "Main.py", cpp: "Main.cpp" }

export function getDockerArgs(language, jobDir, containerName) {
  const image = IMAGES[language]
  if (!image) throw new Error(`Unsupported language: ${language}`)

  return [
    "run", "--rm", "-i",
    "--name", containerName,
    "--network", "none",
    "--memory=256m",
    "--cpus=1",
    "--pids-limit=64",
    "--security-opt", "no-new-privileges",
    "-v", `${jobDir}:/app`,
    "-w", "/app",
    ...image
  ]
}
