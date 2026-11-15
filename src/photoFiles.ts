const formats = new Set(["image/jpeg", "image/png", "image/webp"]);
export async function photoBytes(blob: Blob): Promise<Uint8Array> {
  if (!blob || !formats.has(blob.type))
    throw Error("Bitte ein Foto im Format JPEG, PNG oder WebP auswählen.");
  if (!blob.size)
    throw Error(
      "Das Foto enthält keine lesbaren Bilddaten. Bitte das Foto erneut auswählen. Deine Einträge bleiben lokal gespeichert.",
    );
  if (blob.size > 10 * 1024 * 1024)
    throw Error("Ein Foto darf höchstens 10 MB groß sein.");
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await blob.arrayBuffer());
  } catch {
    throw Error(
      "Die Bilddatei kann auf diesem Gerät nicht mehr gelesen werden. Bitte das Foto erneut auswählen. Deine Einträge bleiben lokal gespeichert.",
    );
  }
  if (bytes.byteLength !== blob.size)
    throw Error(
      "Die Bilddatei wurde nicht vollständig gelesen. Bitte das Foto erneut auswählen.",
    );
  return bytes;
}
export async function materializePhotos(files: File[]): Promise<File[]> {
  const prepared: File[] = [];
  for (const file of files) {
    const bytes = await photoBytes(file);
    prepared.push(
      new File([bytes as BlobPart], file.name, {
        type: file.type,
        lastModified: file.lastModified,
      }),
    );
  }
  return prepared;
}
