import fs from "fs";
import path from "path";

const sdkDir = path.join(process.cwd(), "sdk");

const exts = [".ts", ".tsx"];

const fixFile = (file: string) => {
  let code = fs.readFileSync(file, "utf8");

  code = code.replace(/from ['"](\.\/[^'"]+)['"]/g, (m, p) => {
    if (p.endsWith(".js") || p.endsWith(".ts")) return m;
    return `from "${p}.js"`;
  });

  fs.writeFileSync(file, code, "utf8");
  console.log("fixed:", file);
};

const walk = (dir: string) => {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);

    if (fs.statSync(full).isDirectory()) walk(full);

    if (exts.includes(path.extname(full))) fixFile(full);
  }
};

walk(sdkDir);
