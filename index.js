import "dotenv/config";
import Koa from "koa";
import Router from "@koa/router";
import { MongoClient } from "mongodb";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import cors from "koa-cors";
import bodyParser from "koa-bodyparser";

const app = new Koa();
const router = new Router();
app.use(cors());
app.use(bodyParser());

const client = new MongoClient(process.env.MONGODB_URI);

async function run() {
  try {
    await client.connect();

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } catch (e) {
    console.log(e);
  }
}
run().catch(console.dir);

const database = client.db("taskManager");
const users = database.collection("users");
users.createIndex({ username: 1 }, { unique: true });
const authenticateToken = async (ctx, next) => {
  let jwtToken;
  const authHeader = ctx.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    ctx.status = 401;
    ctx.body = { err: "Invalid JWT Token" };
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        ctx.status = 401;
        ctx.body = { err: "Invalid JWT Token" };
      } else {
        ctx.request.payload = payload;
      }
    });
    await next();
  }
};

router.get("/", (ctx, next) => {
  ctx.body = "hello from koa";
});
router.post("/signup", async (ctx) => {
  try {
    const { username, password } = ctx.request.body;
    const match = await users.findOne({ username: username });
    if (match) {
      ctx.response.status = 400;
      ctx.response.body = { msg: "username already exists" };
    } else {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
      const hashedPassword = await bcrypt.hash(password, 10);
      await users.insertOne({
        username: username,
        password: hashedPassword,
        taskList: [],
      });
      ctx.response.status = 200;
      ctx.response.body = { jwtToken };
    }
  } catch (e) {
    console.log(e);
    ctx.response.status = 500;
    ctx.response.body = { err: e };
  }
});
router.post("/login", async (ctx) => {
  try {
    console.log("login", ctx);
    const { username, password } = ctx.request.body;
    const match = await users.findOne({ username: username });
    if (!match) {
      ctx.response.status = 400;
      ctx.response.body = { err: "User does not exist" };
    } else {
      const isPasswordMatched = await bcrypt.compare(password, match.password);
      if (isPasswordMatched) {
        const payload = {
          username: username,
        };
        const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
        ctx.response.status = 200;
        ctx.response.body = { jwtToken };
      } else {
        ctx.response.status = 400;
        ctx.response.body = { err: "Incorrect Password" };
      }
    }
  } catch (error) {
    console.log(error);
    ctx.response.status = 500;
    ctx.response.body = { err: error };
  }
});
router.get("/profile", authenticateToken, async (ctx) => {
  try {
    const { username } = ctx.request.payload;
    const match = await users.findOne({ username: username });
    if (match) {
      ctx.response.status = 200;
      ctx.response.body = match;
    } else {
      ctx.response.status = 400;
      ctx.response.body = { err: "cannot find the user" };
    }
  } catch (error) {
    console.log(error);
    ctx.response.status = 500;
    ctx.response.body = { err: error };
  }
});
router.put("/editprofile/username", authenticateToken, async (ctx) => {
  try {
    const { username } = ctx.request.payload;
    const { newUsername } = ctx.request.body;
    const match = await users.findOne({ username: username });
    const exists = await users.findOne({ username: newUsername });
    if (!match) {
      ctx.response.status = 400;
      ctx.response.body = { err: "cannot find the user" };
    } else if (exists) {
      ctx.response.status = 401;
      ctx.response.body = { err: "username already exists" };
    } else {
      await users.updateOne(
        { username: username },
        { $set: { username: newUsername } }
      );
      ctx.response.status = 200;
      ctx.response.body = { msg: "successfully updated" };
    }
  } catch (error) {
    console.log(error);
    ctx.response.status = 500;
    ctx.response.body = { err: error };
  }
});
router.put("/editprofile/password", authenticateToken, async (ctx) => {
  try {
    const { username } = ctx.request.payload;
    const { password, pass } = ctx.request.body;
    const match = await users.findOne({ username: username });
    if (!match) {
      ctx.response.status = 400;
      ctx.response.body = { err: "cannot find the user" };
    } else {
      const isPasswordMatched = await bcrypt.compare(pass, match.password);
      if (isPasswordMatched) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await users.updateOne(
          { username: username },
          { $set: { password: hashedPassword } }
        );
        ctx.response.status = 200;
        ctx.response.body = { msg: "Password changed successfully" };
      } else {
        ctx.response.status(400);
        ctx.response.body = { msg: "Incorrect previous password" };
      }
    }
  } catch (error) {
    console.log(error);
    ctx.response.status = 500;
    ctx.response.body = { err: error };
  }
});
router.get("/tasks", authenticateToken, async (ctx) => {
  try {
    const { username } = ctx.request.payload;
    const match = await users.findOne({ username: username });
    if (match) {
      ctx.response.status = 200;
      ctx.response.body = match.taskList ? match.taskList : [];
    } else {
      ctx.response.status = 400;
      ctx.response.body = { err: "cannot find the user" };
    }
  } catch (error) {
    console.log(error);
    ctx.response.status = 500;
    ctx.response.body = { err: error };
  }
});
router.post("/tasks", authenticateToken, async (ctx) => {
  try {
    const { id, taskName, description, dueDate, status, priority } =
      ctx.request.body;
    const { username } = ctx.request.payload;
    const match = await users.findOne({ username: username });
    if (match) {
      const arr = match.taskList ? match.taskList : [];
      arr.push({ id, taskName, description, dueDate, status, priority });
      await users.updateOne(
        { username: username },
        { $set: { taskList: arr } }
      );
      ctx.response.status = 200;
      ctx.response.body = { msg: "successfully added" };
    } else {
      ctx.response.status = 400;
      ctx.response.body = { err: "cannot find user" };
    }
  } catch (error) {
    console.log(error);
    ctx.response.status = 500;
    ctx.response.body = { err: error };
  }
});
router.put("/tasks/:id", authenticateToken, async (ctx) => {
  try {
    const { id } = ctx.request.params;
    const { taskName, description, dueDate, status, priority } =
      ctx.request.body;
    const { username } = ctx.request.payload;
    const match = await users.findOne({ username: username });
    if (match) {
      let arr = match.taskList;
      arr = arr.filter((task) => task.id !== id);
      arr.push({ id, taskName, description, dueDate, status, priority });
      await users.updateOne(
        { username: username },
        { $set: { taskList: arr } }
      );
      ctx.response.status = 200;
      ctx.response.body = { msg: "Status successfully updated" };
    } else {
      ctx.response.status = 400;
      ctx.response.body = { err: "cannot find user" };
    }
  } catch (error) {
    console.log(error);
    ctx.response.status = 500;
    ctx.response.body = { err: error };
  }
});
router.delete("/tasks/:id", authenticateToken, async (ctx) => {
  try {
    const { id } = ctx.request.params;
    const { username } = ctx.request.payload;
    const match = await users.findOne({ username: username });
    if (match) {
      let arr = match.taskList;
      arr = arr.filter((task) => task.id !== id);
      await users.updateOne(
        { username: username },
        { $set: { taskList: arr } }
      );
      ctx.response.status = 200;
      ctx.response.body = { msg: "successfully deleted" };
    } else {
      ctx.response.status = 400;
      ctx.response.body = { err: "cannot find user" };
    }
  } catch (error) {
    console.log(error);
    ctx.response.status = 500;
    ctx.response.body = { err: error };
  }
});

app.use(router.routes()).use(router.allowedMethods());

app.listen(3000);
