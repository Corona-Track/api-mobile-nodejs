'use strict'

import * as admin from 'firebase-admin';
import HeatMapService from './heatmapservice';

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  databaseURL: 'https://coronatrackrn.firebaseio.com'
});

const firestore = admin.firestore();

// If you prefer async/await, use the following
//
module.exports = async function (fastify, opts) {
  fastify.get('/heatmap/getMapElementsByPosition', async function (req, res) {
    try {
      let { markerCentral, markerNorthWest, markerSouthWest, markerNorthEast, markerSouthEast } = req.body;
      //Check for null because it can use negative values
      if (!(markerCentral !== null &&
        markerNorthWest !== null &&
        markerSouthWest !== null &&
        markerNorthEast !== null &&
        markerSouthEast !== null))
        return res.sendStatus(500);
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
    } catch (e) { return res.statusCode(500); }
  })
}


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