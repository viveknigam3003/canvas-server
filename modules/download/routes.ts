import archiver from "archiver";
import Router from "express";
import { fabric } from "fabric";
import puppeteer from "puppeteer";

const router = Router();

interface Artboard {
  id: string;
  name: string;
  width: number;
  height: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state?: Record<string, any>;
}

const getMultiplierFor4K = (width?: number, height?: number): number => {
  // Assuming the canvas is not already 4K, calculate the multiplier needed
  // to scale the current canvas size up to 4K resolution
  const maxWidth = 3840; // for UHD 4K width
  const maxHeight = 2160; // for UHD 4K height
  const widthMultiplier = maxWidth / (width || 1);
  const heightMultiplier = maxHeight / (height || 1);

  // Use the smaller multiplier to ensure the entire canvas fits into the 4K resolution
  return Math.min(widthMultiplier, heightMultiplier);
};

const exportArtboard = async (artboard: Artboard): Promise<string> => {
  const artboardLeftAdjustment = artboard?.state?.objects.find(
    (item: any) => item.data.id === artboard.id
  )?.left;
  const artboardTopAdjustment = artboard?.state?.objects.find(
    (item: any) => item.data.id === artboard.id
  )?.top;

  if (!artboardLeftAdjustment || !artboardTopAdjustment) {
    throw new Error("Artboard left or top adjustment is undefined");
  }

  const artboardWidth = artboard.state?.objects.find(
    (item: any) => item.data.id === artboard.id
  )?.width;
  const artboardHeight = artboard.state?.objects.find(
    (item: any) => item.data.id === artboard.id
  )?.height;

  if (!artboardWidth || !artboardHeight) {
    throw new Error("Artboard width or height is undefined");
  }

  // Now we need to create a new canvas and add the artboard to it
  const offscreenCanvas = new fabric.Canvas(`print-canvas`, {
    width: artboardWidth,
    height: artboardHeight,
  });

  const adjustedStateJSONObjects = artboard.state?.objects?.map((item: any) => {
    return {
      ...item,
      left: item.left - artboardLeftAdjustment,
      top: item.top - artboardTopAdjustment,
    };
  });

  if (!adjustedStateJSONObjects) {
    throw new Error("Adjusted state json objects is undefined");
  }

  const adjustedStateJSON = {
    ...artboard.state,
    objects: adjustedStateJSONObjects,
  };

  return new Promise((resolve, reject) => {
    try {
      offscreenCanvas.loadFromJSON(adjustedStateJSON, () => {
        offscreenCanvas.renderAll();

        const multiplier = getMultiplierFor4K(artboardWidth, artboardHeight);

        // render the offscreen canvas to a dataURL
        const dataURL = offscreenCanvas.toDataURL({
          format: "png",
          multiplier,
          width: artboardWidth,
          height: artboardHeight,
        });

        // write the dataURL to a file
        const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");
        // Send image back to client
        resolve(base64Data);
      });
    } catch (error) {
      console.log(error);
      reject(error);
    }
  });
};

router.get("/", (req, res) => {
  console.log("GET /api/download");
});

router.post("/", async (req, res) => {
  const { artboards, origin } = req.body;
  // const artboard: Artboard = artboards[0];

  // Launch a new browser session
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  // Create a newPage instance
  const page = await browser.newPage();
  // Set the page resolution
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
  // Go to our page with the artboard
  const url = `${origin}/artboard`;
  await page.goto(url, { waitUntil: "networkidle0" });

  // Get the blob for each artboard and zip them together using archiver
  const zip = archiver("zip", { zlib: { level: 9 } });

  // Listen for all archive data to be written
  // 'close' event is fired only when a file descriptor is involved
  zip.on("error", (err) => {
    throw err;
  });

  try {
    const promises = artboards.map((artboard: Artboard) => {
      return exportArtboard(artboard);
    });
    const blobs: string[] = await Promise.all(promises);

    blobs.forEach((blob, index) => {
      zip.append(Buffer.from(blob, "base64"), {
        name: `${artboards[index].name}.png`,
      });
    });
    zip.finalize();
    // Return the zip file to the client
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-disposition": `attachment; filename=Artboards.zip`,
    });
    zip.pipe(res);
  } catch (error) {
    console.log(error);
    res.send("error");
  } finally {
    await browser.close();
  }
});

export default router;
