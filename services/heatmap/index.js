'use strict'

const admin = require('firebase-admin');
const HeatMapService = require('./heatmapservice');

var serviceAccount = require('../../config/coronatrackrn-firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://coronatrackrn.firebaseio.com"
});

const firestore = admin.firestore();

// If you prefer async/await, use the following
//
module.exports = async function (fastify, opts, next) {
  fastify.post('/heatmap/getMapElementsByPosition', async function (req, res) {
    try {
      //Check for null because it can use negative values
      if (!(req.body.markerCentral !== null &&
        req.body.markerNorthWest !== null &&
        req.body.markerSouthWest !== null &&
        req.body.markerNorthEast !== null &&
        req.body.markerSouthEast !== null))
        return res.status(404);
      let { markerCentral, markerNorthWest, markerSouthWest, markerNorthEast, markerSouthEast } = req.body;

      let region = {
        markerCentral,
        markerNorthWest,
        markerSouthWest,
        markerNorthEast,
        markerSouthEast
      };
      let users = await getUsersInsideRange(region);
      let citiesContent = await getAllCities(region);
      let convertedUsers = HeatMapService.populateUserCity(citiesContent.allCities, users);
      let gridSquares = HeatMapService.generateGrid(region, citiesContent, convertedUsers);
      let squaresToCalculate = HeatMapService.processGridSquares(gridSquares);
      let calculatedSquares = HeatMapService.calculateSquares(squaresToCalculate);
      return res.status(200).send(JSON.stringify(calculatedSquares));
    } catch (e) { res.status(500).send(e) }
  })

  next()
}


// module.exports = async function (fastify, opts) {
//   fastify.get('/heatmap/getMapElementsByPosition', async function (req, res) {
//     try {
//       if (!req.body)
//         return res.status(404);
//       //Check for null because it can use negative values
//       if (!(markerCentral !== null &&
//         markerNorthWest !== null &&
//         markerSouthWest !== null &&
//         markerNorthEast !== null &&
//         markerSouthEast !== null))
//         return res.status(404);
//       let { markerCentral, markerNorthWest, markerSouthWest, markerNorthEast, markerSouthEast } = req.body;

//       let region = {
//         markerCentral,
//         markerNorthWest,
//         markerSouthWest,
//         markerNorthEast,
//         markerSouthEast
//       };
//       let users = await getUsersInsideRange(region);
//       let citiesContent = await getAllCities(region);
//       let convertedUsers = HeatMapService.populateUserCity(citiesContent.allCities, users);
//       let gridSquares = HeatMapService.generateGrid(region, citiesContent, convertedUsers);
//       let squaresToCalculate = HeatMapService.processGridSquares(gridSquares);
//       let calculatedSquares = HeatMapService.calculateSquares(squaresToCalculate);
//       return res.status(200).send(JSON.stringify(calculatedSquares));
//     } catch (e) { res.status(500).send(e) }
//   })
// }


const getUsersInsideRange = async region => {
  let { markerNorthWest, markerSouthWest, markerNorthEast } = region;
  return new Promise((resolve, reject) => {
    let usersPositionCollection = firestore.collection('usersposition');
    let usersQuery = usersPositionCollection
      .where('longitude', '>=', markerNorthWest.longitude)
      .where('longitude', '<=', markerNorthEast.longitude);
    usersQuery
      .get()
      .then(res => {
        let usersPositionList = [];
        res.docs.forEach(doc => {
          let userPosition = doc.data();
          if (!(userPosition.latitude >= markerSouthWest.latitude &&
            userPosition.latitude <= markerNorthWest.latitude))
            return;

          if (userPosition.latitude === null || userPosition.longitude === null)
            return;

          if (userPosition.contaminated) {
            usersPositionList.push(userPosition);
            return;
          }
          if (userPosition.contagionRisk && userPosition.contagionRisk === 3) {
            usersPositionList.push(userPosition);
            return;
          }
        });
        return resolve(usersPositionList);
      })
      .catch(error => { reject(new Error(error)); });
  });
};

const getAllCities = async region => {
  let { markerNorthWest, markerSouthWest, markerNorthEast } = region;
  return new Promise((resolve, reject) => {
    let citiesCollection = firestore.collection('cities');
    citiesCollection.get()
      .then(res => {
        let allCities = [];
        let citiesInsideRange = [];
        res.docs.forEach(doc => {
          let cityPosition = doc.data();
          allCities.push(cityPosition);
          if (cityPosition.latitude >= markerSouthWest.latitude &&
            cityPosition.latitude <= markerNorthWest.latitude &&
            cityPosition.longitude >= markerNorthWest.longitude &&
            cityPosition.longitude <= markerNorthEast.longitude)
            citiesInsideRange.push(cityPosition);
        });
        return resolve({
          allCities: allCities,
          insideRange: citiesInsideRange
        });
      })
      .catch(error => { return reject(new Error(error)); });
  });
};