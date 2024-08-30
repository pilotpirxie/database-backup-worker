import { createGzip } from "node:zlib";
import { createReadStream, createWriteStream } from "node:fs";
import { promisify } from "node:util";
import { pipeline } from "node:stream";

export async function compressFile(fileName: string): Promise<string> {
  const gzip = createGzip();
  const source = createReadStream(fileName);
  const destination = createWriteStream(`${fileName}.gz`);
  const pipelineAsync = promisify(pipeline);

  console.info(`Compressing file ${fileName}`);
  await pipelineAsync(source, gzip, destination);

  return `${fileName}.gz`;
}
