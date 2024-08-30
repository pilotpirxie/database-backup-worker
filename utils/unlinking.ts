import fs from "fs";

export default function unlinking({ fileName }: { fileName: string }) {
  console.info(`Unlinking local database backup ${fileName}`);
  fs.unlinkSync(fileName);
}
