const express = require('express');
const LanguageService = require('./language-service');
const LinkedList = require('./linkedList');

const { requireAuth } = require('../middleware/jwt-auth');

const LanguageRouter = express.Router();
const jsonBodyParser = express.json();


LanguageRouter
  .use(requireAuth)
  .use(async (req, res, next) => {
    try {
      const language = await LanguageService.getUsersLanguage(
        req.app.get('db'),
        req.user.id,
      )

      if (!language)
        return res.status(404).json({
          error: `You don't have any languages`,
        })

      req.language = language
      next()
    } catch (error) {
      next(error)
    }
  });


LanguageRouter
  .get('/', async (req, res, next) => {
    try {
      const words = await LanguageService.getLanguageWords(
        req.app.get('db'),
        req.language.id,
      )

      res.json({
        language: req.language,
        words,
      })
      next()
    } catch (error) {
      next(error)
    }
  });



LanguageRouter
  .get('/head', async (req, res, next) => {
    try {
      const [word] = await LanguageService.getWordById(
        req.app.get('db'),
        req.language.head
      );

      res.json({
        nextWord: word.original,
        wordCorrectCount: word.correct_count,
        wordIncorrectCount: word.incorrect_count,
        totalScore: req.language.total_score
      });
      next();
    } catch (error) {
      next(error);
    }
  });


LanguageRouter
  .post('/guess', jsonBodyParser, async (req, res, next) => {
      const srdb = req.app.get('db');
    
    try {
      const { guess } = req.body;
      if (!req.body.guess) {
        return res.status(400).json({
          error: `Missing 'guess' in request body`
        });
      }

      const list = new LinkedList();
      let [hNode] = await LanguageService.getWordById(srdb, req.language.head);
      list.insertFirst(hNode);

      while (hNode.next != null) {
        const [lnode] = await LanguageService.getWordById(srdb, hNode.next);
        list.insertLast(lnode);
        hNode = lnode;
      }
    
      let correct = false;
      if (guess.toUpperCase() === list.head.value.translation.toUpperCase()) {
        correct = true;
        ++list.head.value.correct_count;
        list.head.value.memory_value *= 2;
        ++req.language.total_score;
      } else {
        ++list.head.value.incorrect_count;
        list.head.value.memory_value = 1;
      }
    
      const oldHead = list.head;
      list.remove(list.head.value);
      list.insertAt(oldHead.value.memory_value, oldHead.value);

      let tNode = list.head;
      let langHead = tNode.value.id;
      while (tNode != null) {
        await LanguageService.updateWords(
          srdb,
          tNode.value,
          tNode.next != null ? tNode.next.value : null
        );
        tNode = tNode.next;
      }

      await LanguageService.updateHead(
        srdb,
        req.language.id,
        req.language.user_id,
        langHead
      );
    
      await LanguageService.updateTotalScore(
        srdb,
        req.language.id,
        req.language.user_id,
        req.language.total_score
      );
    
      const response = {
        nextWord: list.head.value.original,
        wordCorrectCount: list.head.value.correct_count,
        wordIncorrectCount: list.head.value.incorrect_count,
        totalScore: req.language.total_score,
        answer: oldHead.value.translation,
        isCorrect: correct
      };
      return res.status(200).json(response);
    } catch (error) {
      next(error);
    }
  });  

module.exports = LanguageRouter;
