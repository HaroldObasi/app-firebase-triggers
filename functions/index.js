const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { CloudTasksClient } = require("@google-cloud/tasks");
const axios = require("axios");

admin.initializeApp();

const db = admin.firestore();
const SPOONACULAR_API_KEY = "fbbde4668a8849148fadd3ba8dd69449";
//const SPOONACULAR_API_KEY = "fbbde4668a8849148fadd3ba8dd69449"; // REPLICA
//const SPOONACULAR_API_KEY = "563ec2ac4d8a474f87c6f1a2c3cc8f83";

const getData = async (id) => {
  try {
    const response = await axios.get(
      `https://api.spoonacular.com/recipes/${id}/similar?apiKey=${SPOONACULAR_API_KEY}`
    );
    const data =
      response.data[Math.floor(Math.random() * response.data.length)];
    console.log("prior data: ", data);
    return data.id;
  } catch (error) {
    console.log(error);
  }
};

const getRandom = async () => {
  try {
    const response = await axios.get(
      `https://api.spoonacular.com/recipes/random?apiKey=${SPOONACULAR_API_KEY}&number=1`
    );
    const random = response.data.recipes[0];
    console.log("random data recieved: ", random);
    return random.id;
  } catch (error) {
    console.log(error);
  }
};

const recommend = async (userId) => {
  const userDataRef = db.collection("users").doc(userId);
  const results = [];
  try {
    const response = await userDataRef.get();
    const userData = response.data();

    const userLikesIds = userData.likes;
    if (userLikesIds.length <= 5) {
      var diff = 5 - userLikesIds.length;
      var num = 0;
      for (let xa of userLikesIds) {
        results.push(await getData(xa));
      }
      while (num < diff) {
        console.log("random loop");
        results.push(await getRandom());
        num += 1;
      }
      console.log("less than 5: ", results[0], results[1]);
      return results;
    } else if (userLikes.length > 5 && userLikes.length < 10) {
      for (let x of userLikesIds) {
        results.push(await getData(x));
      }
      console.log("rec results between 5 and 10: ", results);
      return results;
    } else if (userLikes.length >= 10) {
      const sample_without_duplicates = [...Array(userLikesIds.length).keys()]
        .sort(() => 0.5 - Math.random())
        .slice(0, 10)
        .map((index) => userLikesIds[index]);
      for (let y of sample_without_duplicates) {
        results.push(await getData(y));
      }
      console.log("rec results more than 10: ", results);
      return results;
    }
  } catch (error) {
    console.log(error);
  }
};

exports.onUserCreate = functions.firestore
  .document("users/{userId}")
  .onCreate(async (snap, context) => {
    const values = snap.data();
    const userId = snap.id;
    await db
      .collection("recommendations")
      .doc(snap.id)
      .set({
        lastUpdated: admin.firestore.Timestamp.fromDate(new Date()),
        userName: values.firstName,
        recipeIds: ["nothing for now"],
      });
  });

exports.onRecommendationCreate = functions.firestore
  .document("recommendations/{id}")
  .onCreate(async (snap, context) => {
    const values = snap.data();
    const projectId = "react-firebase-8a28c";
    const location = "europe-west1";
    const queue = "food-rec";

    const taskClient = new CloudTasksClient();
    const queuePath = taskClient.queuePath(projectId, location, queue);

    const url = `https://us-central1-${projectId}.cloudfunctions.net/foodRecCallBack`;
    const docPath = snap.ref.path;
    const userId = snap.id;
    const payload = { docPath, userId };

    const task = {
      httpRequest: {
        httpMethod: "POST",
        url,
        body: Buffer.from(JSON.stringify(payload)).toString("base64"),
        headers: {
          "Content-Type": "application/json",
        },
      },
      scheduleTime: {
        seconds: 5 + Date.now() / 1000,
      },
    };
    await taskClient.createTask({ parent: queuePath, task });
  });

exports.foodRecCallBack = functions.https.onRequest(async (req, res) => {
  const projectId = "react-firebase-8a28c";
  const location = "europe-west1";
  const queue = "food-rec";

  const taskClient = new CloudTasksClient();
  const queuePath = taskClient.queuePath(projectId, location, queue);

  const url = `https://us-central1-${projectId}.cloudfunctions.net/foodRecCallBack`;

  const payload = req.body;
  const userId = req.body.userId;

  const count = await recommend(userId);
  console.log(`very active count: ${count}`);
  try {
    await admin
      .firestore()
      .doc(payload.docPath)
      .update({
        lastUpdated: admin.firestore.Timestamp.fromDate(new Date()),
        recommendedRecipes: count,
      });
    res.send(200);

    try {
      const task = {
        httpRequest: {
          httpMethod: "POST",
          url,
          body: Buffer.from(JSON.stringify(payload)).toString("base64"),
          headers: {
            "Content-Type": "application/json",
          },
        },
        scheduleTime: {
          seconds: 43200 + Date.now() / 1000,
        },
      };
      await taskClient.createTask({ parent: queuePath, task });
    } catch (error) {
      console.error(error);
      res.status(500).send(error);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});
