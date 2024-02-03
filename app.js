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


// ANOTHER WAY 
const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const databasePath = path.join(__dirname, "twitterClone.db");

const initializeDbAndStartServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndStartServer();

const convertUserDbObjectToResponseObject = (dbObject) => {
  return {
    userId: dbObject.user_id,
    name: dbObject.name,
    username: dbObject.username,
    password: dbObject.password,
    gender: dbObject.gender,
  };
};

const convertFollowerDbObjectToResponseObject = (dbObject) => {
  return {
    followerId: dbObject.follower_id,
    followerUserId: dbObject.follower_user_id,
    followingUserId: dbObject.following_user_id,
  };
};

const convertTweetDbObjectToResponseObject = (dbObject) => {
  return {
    tweetId: dbObject.tweet_id,
    tweet: dbObject.tweet,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

const convertReplyDbObjectToResponseObject = (dbObject) => {
  return {
    replyId: dbObject.reply_id,
    tweetId: dbObject.tweet_id,
    reply: dbObject.reply,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  };
};

const convertLikeDbObjectToResponseObject = (dbObject) => {
  return {
    likeId: dbObject.like_id,
    tweetId: dbObject.tweet_id,
    userId: dbObject.user_id,
    dateTime: dbObject.dateTime,
  };
};

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  // check if user already exists with the same username
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  if (dbUser) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    // Create a new user
    const hashedPassword = await bcrypt.hash(password, 10);
    const addNewUserQuery = `
        INSERT INTO user (name, username, password, gender) 
        VALUES ('${name}', '${username}', '${hashedPassword}', '${gender}');
        `;
    await database.run(addNewUserQuery);
    response.send("User created successfully");
  }
});

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  // check if the username exists
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  if (!dbUser) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (!isPasswordMatched) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    }
  }
});

// Authentication Middleware
const authenticateUser = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (!authHeader) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeader.split(" ")[1];
    jwt.verify(jwtToken, "MY_SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

app.get("/user/tweets/feed/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersObjectsList = await database.all(followingUsersQuery);
  const followingUsersList = followingUsersObjectsList.map((object) => {
    return object["following_user_id"];
  });
  const getTweetsQuery = `
  SELECT 
    user.username AS username, 
    tweet.tweet AS tweet, 
    tweet.date_time AS dateTime
  FROM 
    tweet 
    INNER JOIN user ON tweet.user_id = user.user_id 
  WHERE
    tweet.user_id IN (
        ${followingUsersList}
    )
  ORDER BY tweet.date_time DESC 
  LIMIT 4;
  `;
  //   console.log(getTweetsQuery);
  const tweets = await database.all(getTweetsQuery);
  response.send(tweets);
});

app.get("/user/following/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersObjectsList = await database.all(followingUsersQuery);
  const followingUsersList = followingUsersObjectsList.map((object) => {
    return object["following_user_id"];
  });
  const getFollowingQuery = `
  SELECT 
    user.name AS name
  FROM 
    user
  WHERE
    user_id IN (
        ${followingUsersList}
    );
  `;
  //   console.log(getTweetsQuery);
  const following = await database.all(getFollowingQuery);
  response.send(following);
});

app.get("/user/followers/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  const followerUsersQuery = `
    SELECT follower_user_id FROM follower 
    WHERE following_user_id = ${dbUser.user_id};
  `;
  const followerUsersObjectsList = await database.all(followerUsersQuery);
  const followerUsersList = followerUsersObjectsList.map((object) => {
    return object["follower_user_id"];
  });
  const getFollowersQuery = `
  SELECT 
    user.name AS name
  FROM 
    user
  WHERE
    user_id IN (
        ${followerUsersList}
    );
  `;
  const followers = await database.all(getFollowersQuery);
  response.send(followers);
});

app.get("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
  const tweetInfo = await database.get(getTweetQuery);

  const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
  const followingUsersObjectsList = await database.all(followingUsersQuery);
  const followingUsersList = followingUsersObjectsList.map((object) => {
    return object["following_user_id"];
  });
  if (!followingUsersList.includes(tweetInfo.user_id)) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const { tweet_id, date_time, tweet } = tweetInfo;
    const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like 
    WHERE tweet_id = ${tweet_id} GROUP BY tweet_id;
    `;
    const likesObject = await database.get(getLikesQuery);
    const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply 
    WHERE tweet_id = ${tweet_id} GROUP BY tweet_id;
    `;
    const repliesObject = await database.get(getRepliesQuery);
    response.send({
      tweet,
      likes: likesObject.likes,
      replies: repliesObject.replies,
      dateTime: date_time,
    });
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await database.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await database.get(getTweetQuery);

    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
    const followingUsersObjectsList = await database.all(followingUsersQuery);
    const followingUsersList = followingUsersObjectsList.map((object) => {
      return object["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getLikesQuery = `
        SELECT user_id FROM like 
        WHERE tweet_id = ${tweet_id};
        `;
      const likedUserIdObjectsList = await database.all(getLikesQuery);
      const likedUserIdsList = likedUserIdObjectsList.map((object) => {
        return object.user_id;
      });
      const getLikedUsersQuery = `
      SELECT username FROM user 
      WHERE user_id IN (${likedUserIdsList});
      `;
      const likedUsersObjectsList = await database.all(getLikedUsersQuery);
      const likedUsersList = likedUsersObjectsList.map((object) => {
        return object.username;
      });
      response.send({
        likes: likedUsersList,
      });
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
    const dbUser = await database.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await database.get(getTweetQuery);

    const followingUsersQuery = `
    SELECT following_user_id FROM follower 
    WHERE follower_user_id = ${dbUser.user_id};
  `;
    const followingUsersObjectsList = await database.all(followingUsersQuery);
    const followingUsersList = followingUsersObjectsList.map((object) => {
      return object["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getUserRepliesQuery = `
    SELECT user.name AS name, reply.reply AS reply
    FROM reply 
    INNER JOIN user ON reply.user_id = user.user_id 
    WHERE reply.tweet_id = ${tweet_id};
    `;
      const userRepliesObject = await database.all(getUserRepliesQuery);
      response.send({
        replies: userRepliesObject,
      });
    }
  }
);

app.get("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  const { user_id } = dbUser;
  //   const user_id = 4;
  const getTweetsQuery = `
  SELECT * FROM tweet WHERE user_id = ${user_id}
  ORDER BY tweet_id;
  `;
  const tweetObjectsList = await database.all(getTweetsQuery);

  const tweetIdsList = tweetObjectsList.map((object) => {
    return object.tweet_id;
  });

  const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like 
    WHERE tweet_id IN (${tweetIdsList}) GROUP BY tweet_id
    ORDER BY tweet_id;
    `;
  const likesObjectsList = await database.all(getLikesQuery);
  const getRepliesQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply 
    WHERE tweet_id IN (${tweetIdsList}) GROUP BY tweet_id
    ORDER BY tweet_id;
    `;
  const repliesObjectsList = await database.all(getRepliesQuery);
  response.send(
    tweetObjectsList.map((tweetObj, index) => {
      const likes = likesObjectsList[index] ? likesObjectsList[index].likes : 0;
      const replies = repliesObjectsList[index]
        ? repliesObjectsList[index].replies
        : 0;
      return {
        tweet: tweetObj.tweet,
        likes,
        replies,
        dateTime: tweetObj.date_time,
      };
    })
  );
});

app.post("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  const { user_id } = dbUser;
  const { tweet } = request.body;
  const dateString = new Date().toISOString();
  const dateTime = dateString.slice(0, 10) + " " + dateString.slice(11, 19);
  const addNewTweetQuery = `
  INSERT INTO tweet (tweet, user_id, date_time) 
  VALUES ('${tweet}', ${user_id}, '${dateTime}');
  `;
  await database.run(addNewTweetQuery);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}';
    `;
  const dbUser = await database.get(selectUserQuery);
  const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
  const tweetInfo = await database.get(getTweetQuery);
  if (dbUser.user_id !== tweetInfo.user_id) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `
      DELETE FROM tweet WHERE tweet_id = ${tweetId};
      `;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});

module.exports = app;
