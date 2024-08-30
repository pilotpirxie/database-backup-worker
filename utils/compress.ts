import zlib from "node:zlib";
import fs from "fs";
import { promisify } from "node:util";
import { pipeline } from "node:stream";

export async function compressFile(fileName: string): Promise<string> {
  const gzip = zlib.createGzip();
  const source = fs.createReadStream(fileName);
  const destination = fs.createWriteStream(`${fileName}.gz`);
  const pipelineAsync = promisify(pipeline);

  console.info(`Compressing file ${fileName}`);
  await pipelineAsync(source, gzip, destination);

  return `${fileName}.gz`;
}
