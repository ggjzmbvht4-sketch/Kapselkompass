import { describe, it, expect } from "vitest";
import { photoBytes, materializePhotos } from "./photoFiles";
describe("Stable local photo bytes", () => {
  it("materializes file bytes before the camera/gallery input is unmounted", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const original = new File([bytes], "Foto.png", {
      type: "image/png",
      lastModified: 123,
    });
    const [copy] = await materializePhotos([original]);
    expect(copy).not.toBe(original);
    expect(copy.name).toBe(original.name);
    expect(copy.type).toBe("image/png");
    expect([...(await photoBytes(copy))]).toEqual([...bytes]);
  });
  it("rejects empty or unreadable files without producing an empty upload", async () => {
    await expect(
      photoBytes(new Blob([], { type: "image/jpeg" })),
    ).rejects.toThrow("erneut auswählen");
    const inaccessible = {
      size: 4,
      type: "image/jpeg",
      arrayBuffer: async () => {
        throw Error("Photo provider unavailable");
      },
    } as unknown as Blob;
    await expect(photoBytes(inaccessible)).rejects.toThrow(
      "nicht mehr gelesen",
    );
  });
  it("detects truncated reads and rejects unsupported formats", async () => {
    const truncated = {
      size: 4,
      type: "image/jpeg",
      arrayBuffer: async () => new ArrayBuffer(0),
    } as unknown as Blob;
    await expect(photoBytes(truncated)).rejects.toThrow("nicht vollständig");
    await expect(
      photoBytes(new Blob(["file"], { type: "text/plain" })),
    ).rejects.toThrow("JPEG");
  });
});
