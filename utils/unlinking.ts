import { unlinkSync } from "node:fs";

export default function unlinking({ fileName }: { fileName: string }) {
  console.info(`Unlinking local database backup ${fileName}`);
  unlinkSync(fileName);
}
