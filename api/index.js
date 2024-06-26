const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./models/User");
const Post = require("./models/Post");
const bcrypt = require("bcryptjs");
const app = express();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const multer = require("multer");
const uploadMiddleware = multer({ dest: "uploads/" });
const fs = require("fs");

const salt = bcrypt.genSaltSync(10);
const secret = "asdfd4d56d4fdkkdmd5d85d3sks/dkjdj458skpqpe";

app.use(cors({ credentials: true, origin: "http://localhost:3000" }));

// to parse the json from the request body
app.use(express.json());

app.use(cookieParser());

// We can serve all the static files from uploads. to do this
app.use("/uploads", express.static(__dirname + "/uploads"));

mongoose.connect(
  "mongodb+srv://blog:RNElpumZBl22BHWo@cluster0.faf4pun.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0"
);

// Routes

// To Register the User
// app.post("/register", async (req, res) => {
//   const { username, password } = req.body;
//   try {
//     const userDoc = await User.create({
//       username,
//       password: bcrypt.hashSync(password, salt),
//     });
//     res.json(userDoc);
//   } catch (error) {
//     res.status(400).json(error);
//   }
// });

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if the username already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "Username already exists" });
    }

    // Create a new user with hashed password
    const newUser = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
    });
    res.json(newUser);
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// To Login the User
// app.post("/login", async (req, res) => {
//   const { username, password } = req.body;

//   const userDoc = await User.findOne({ username: username });
//   const passOk = bcrypt.compareSync(password, userDoc.password);

//   if (passOk) {
//     // logged in
//     jwt.sign({ username, id: userDoc._id }, secret, {}, (error, token) => {
//       if (error) {
//         throw error;
//       }

//       res.cookie("token", token).json({
//         id: userDoc._id,
//         username,
//       });
//     });
//   }
// });

app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const userDoc = await User.findOne({ username: username });
    if (!userDoc) {
      // User not found
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passOk = bcrypt.compareSync(password, userDoc.password);
    if (!passOk) {
      // Password doesn't match
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate and send JWT token
    jwt.sign({ username, id: userDoc._id }, secret, {}, (error, token) => {
      if (error) {
        throw error;
      }

      res.cookie("token", token).json({
        id: userDoc._id,
        username,
      });
    });
  } catch (error) {
    console.error("Error logging in:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

// Retrieves user profile information using a JWT from cookies.
// app.get("/profile", (req, res) => {
//   const { token } = req.cookies;

//   jwt.verify(token, secret, {}, (error, info) => {
//     if (error) {
//       throw error;
//     } else {
//       res.json(info);
//     }
//   });
// });

app.get("/profile", (req, res) => {
  const { token } = req.cookies;

  if (!token) {
    return res.status(401).json({ message: "JWT token missing" });
  }

  jwt.verify(token, secret, {}, (error, info) => {
    if (error) {
      return res.status(401).json({ message: "Invalid JWT token" });
    } else {
      res.json(info);
    }
  });
});

// Log out the User
app.post("/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

// Creating Post
app.post("/post", uploadMiddleware.single("file"), async (req, res) => {
  const { originalname, path } = req.file;
  const parts = originalname.split(".");
  const ext = parts[parts.length - 1];
  const newPath = path + "." + ext;
  fs.renameSync(path, newPath);

  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (error, info) => {
    if (error) {
      throw error;
    } else {
      const { title, summary, content } = req.body;
      const postDoc = await Post.create({
        title,
        summary,
        content,
        cover: newPath,
        author: info.id,
      });
      res.json(postDoc);
    }
  });
});

// Update the Post
app.put("/post", uploadMiddleware.single("file"), async (req, res) => {
  let newPath = null;
  if (req.file) {
    const { originalname, path } = req.file;
    const parts = originalname.split(".");
    const ext = parts[parts.length - 1];
    newPath = path + "." + ext;
    fs.renameSync(path, newPath);
  }

  const { token } = req.cookies;
  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) throw err;
    const { id, title, summary, content } = req.body;
    const postDoc = await Post.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json("you are not the author");
    }
    await postDoc.updateOne({
      title,
      summary,
      content,
      cover: newPath ? newPath : postDoc.cover,
    });

    res.json(postDoc);
  });
});

// Delete Post
// This route allows you to delete a post by its ID. It verifies the JWT token from the cookie, checks if the user is the author of the post, and then deletes the post from the database.
app.delete("/post/:id", async (req, res) => {
  const { id } = req.params;
  const { token } = req.cookies;

  if (!token) {
    return res.status(401).json({ message: "JWT token missing" });
  }

  jwt.verify(token, secret, {}, async (error, info) => {
    if (error) {
      return res.status(401).json({ message: "Invalid JWT token" });
    }

    try {
      const postDoc = await Post.findById(id);
      if (!postDoc) {
        return res.status(404).json({ message: "Post not found" });
      }

      const isAuthor =
        JSON.stringify(postDoc.author) === JSON.stringify(info.id);
      if (!isAuthor) {
        return res
          .status(400)
          .json({ message: "You are not the author of this post" });
      }

      await postDoc.deleteOne();
      res.json({ message: "Post deleted successfully" });
    } catch (error) {
      res.status(500).json({ message: "Internal server error" });
    }
  });
});

//  Retrieves a list of posts, sorted by creation date and limited to 20.  Fetching All the Post from DB
app.get("/post", async (req, res) => {
  res.json(
    await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20)
  );
});

// Retrieves a specific post by ID.
app.get("/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findById(id).populate("author", ["username"]);
  res.json(postDoc);
});

app.listen(4000, () => {
  console.log("Running");
});

// RNElpumZBl22BHWo
