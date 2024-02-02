const express = require("express");
const app = express();
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

app.use(express.json());

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const initializationDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("SERVER IS RUNNING AT http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Db Error:'${e.message}'`);
    process.exit(1);
  }
};

initializationDbAndServer();

const getFollowingPeopleOfUser = async (username) => {
  const getTheFollowingPeopleQuery = `
  select 
  following_user_id from follower
  inner join user on user.user_id = follower.follower_user_id
  where user.username = '${username}'`;
  const followingPeople = await db.all(getTheFollowingPeopleQuery);
  const arrayOfIds = followingPeople.map(
    (eachUser) => eachUser.following_user_id
  );
  console.log(followingPeople);
  return arrayOfIds;
};

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secreteKey", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        request.userId = payload.userId;
        next();
      }
    });
  }
};

const tweetAccessVerification = async (request, response, next) => {
  const { userId } = request;
  const { tweetId } = request.params;
  const getTweetQuery = `SELECT * FROM tweet INNER JOIN follower
    ON tweet.user_id = follower.following_user_id
    WHERE tweet.tweet_id = '${tweetId}' AND follower_user_id = '${userId}';`;
  const tweet = await db.get(getTweetQuery);
  if (tweet === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    next();
  }
};

// API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `select * from user where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const creatUserQuery = `
            INSERT INTO 
                user(username,password,name,gender)
            VALUES
                ('${username}','${hashedPassword}','${name}','${gender}')`;
      const dbResponse = await db.run(creatUserQuery);
      console.log(dbResponse);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
  console.log(hashedPassword);
});

// APL 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `select * from user where username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser !== undefined) {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = { username, userId: dbUser.user_id };
      const jwtToken = jwt.sign(payload, "secreteKey");
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  } else {
    response.status(400);
    response.send("Invalid user");
  }
});

// API 3
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  let { username } = request;
  const followingPeopleIds = await getFollowingPeopleOfUser(username);
  const userQuery = `
  select 
    username,tweet,date_time as dateTime 
  from 
    user INNER JOIN tweet on user.user_id = tweet.user_id
  where
    user.user_id IN  (${followingPeopleIds})
  ORDER BY
    date_time DESC
  limit 4`;
  const dbResponse = await db.all(userQuery);
  response.send(dbResponse);
  console.log(dbResponse);
});

// APL 4
app.get("/user/following/", authenticateToken, async (request, response) => {
  let { username, userId } = request;
  const getFollowingUserQuery = `
  select 
    name
  from 
    follower INNER JOIN user on user.user_id = follower.following_user_id
  where
    follower_user_id = '${userId}'`;
  const dbResponse = await db.all(getFollowingUserQuery);
  response.send(dbResponse);
  console.log(dbResponse);
});

// APL 5
app.get("/user/followers/", authenticateToken, async (request, response) => {
  let { username, userId } = request;
  const getFollowersUserQuery = `
  select 
     DISTINCT name
  from 
    follower INNER JOIN user on user.user_id = follower.follower_user_id
  where
    following_user_id = '${userId}'`;
  const dbResponse = await db.all(getFollowersUserQuery);
  response.send(dbResponse);
  console.log(dbResponse);
});

// API 6

app.get(
  "/tweets/:tweetId/",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { username, userId } = request;
    const { tweetId } = request.params;
    const getTweetQuery = `
    select 
        tweet,
        (SELECT COUNT() FROM like WHERE tweet_id = '${tweetId}') AS likes,
        (SELECT COUNT() FROM reply WHERE tweet_id = '${tweetId}') AS replies,
        date_time AS dateTime
    from 
        tweet
    where tweet.tweet_id = '${tweetId}'`;
    const tweet = await db.get(getTweetQuery);
    response.send(tweet);
  }
);

// API 7
app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getLikesQuery = `SELECT username from user inner join like on user.user_id = like.user_id
    where tweet_id = '${tweetId}'`;
    const likes = await db.all(getLikesQuery);
    const userArray = likes.map((eachUser) => eachUser.username);
    response.send({ likes: userArray });
  }
);

// API 8

app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  tweetAccessVerification,
  async (request, response) => {
    const { tweetId } = request.params;
    const getRepliesQuery = `SELECT name,reply 
    from 
    user inner join reply on user.user_id = reply.user_id
    where tweet_id = '${tweetId}';`;
    const repliesUser = await db.all(getRepliesQuery);
    response.send({ replies: repliesUser });
  }
);

// API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { userId } = request;
  const getTweetQuery = `
    select tweet,
    count(DISTINCT like_id) as likes,
    count(DISTINCT reply_id) as replies,
    date_time as dateTime
    from tweet left join reply on tweet.tweet_id = reply.tweet_id
    left join like on tweet.tweet_id = like.tweet_id 
    where tweet.user_id = '${userId}'
    group by tweet.tweet_id;`;
  const tweets = await db.all(getTweetQuery);
  response.send(tweets);
});

// API 10

app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const userId = parseInt(request.userId);
  const dateTime = new Date().toJSON().substring(0, 19).replace("T", " ");
  const createTweetQuery = `INSERT INTO 
    tweet(tweet, user_id, date_time)
    VALUES('${tweet}', ${userId}, '${dateTime}')`;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

// API 11

app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { userId } = request;
    const getTheTweetQuery = `SELECT * FROM tweet WHERE user_id = '${userId}' AND tweet_id = '${tweetId}';`;
    const tweet = await db.get(getTheTweetQuery);

    if (tweet === undefined) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const deleteTweetQuery = `DELETE FROM tweet WHERE tweet_id = '${tweetId}';`;
      await db.run(deleteTweetQuery);
      response.send("Tweet Removed");
    }
  }
);
module.exports = app;
