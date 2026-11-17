import path from "path"

// Each run gets its own container: no network, capped memory, CPU and
// process count, and no privilege escalation. The job folder is mounted as
// the working directory.
export function getDockerCommand(language, filePath) {
  const absDir = path.resolve(path.dirname(filePath))

  const base = `
    docker run --rm -i
    --network none
    --memory=256m
    --cpus=1
    --pids-limit=64
    --security-opt no-new-privileges
    -v "${absDir}:/app"
    -w /app
  `.replace(/\s+/g, " ").trim()

  if (language === "java") {
    return `${base} eclipse-temurin:17 sh -c "javac Main.java && java Main"`
  }

  if (language === "python") {
    return `${base} python:3 python Main.py`
  }

  if (language === "cpp") {
    return `${base} gcc bash -c "g++ Main.cpp -o a.out && ./a.out"`
  }

  throw new Error("Unsupported language")
}
