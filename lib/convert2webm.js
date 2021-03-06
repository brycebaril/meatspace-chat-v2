'use strict';

var fs = require('fs');
var child = require('child_process');

var uuid = require('uuid');
var dataURIBuffer = require('data-uri-to-buffer');
var readimage = require('readimage');
var writepng = require('writepng');
var glitch = require('./glitch');
var glob = require('glob');

var TMP_DIR = __dirname + '/../tmp/';
var VIDEO_FORMAT = 'webm';
var IMAGE_FORMAT = 'png';

exports.transform = function (mediaArr, message, next) {
  // write images to tmp files
  var mediaId = uuid.v4();
  var video = new Buffer(0);
  var count = 0;

  var deleteFiles = function () {
    glob(TMP_DIR + mediaId + '*', function(err, files) {
      if (err) {
        console.log('glob error: ', err);
        return;
      }

      files.forEach(function(file) {
        fs.unlink(file, function(err) {
          if (err) {
            console.log('error unlinking ' + file + ':', err);
          }
        });
      });
    });
  };

  var writeWebm = function () {
    child.exec('ffmpeg -i "' + TMP_DIR + mediaId +
      '-%d.' + IMAGE_FORMAT + '" -filter:v "setpts=2.0*PTS" -vcodec libvpx -an "' +
      TMP_DIR + mediaId + '.' + VIDEO_FORMAT + '"', { timeout: 3000 },
      function (err, stdout, stderr) {

      if (err) {
        next(err);
        deleteFiles();
        return;
      }

      var readStream = fs.createReadStream(TMP_DIR + mediaId + '.' + VIDEO_FORMAT);

      readStream.on('data', function (chunk) {
        video = Buffer.concat([video, chunk]);
      });

      readStream.on('error', function (err) {
        next(err);
        deleteFiles();
      });

      readStream.on('end', function () {
        next(null, 'data:video/' + VIDEO_FORMAT + ';base64,' + video.toString('base64'));
        deleteFiles();
      });
    });
  };

  writeFrames(mediaId, mediaArr, message, function (errors) {
    if (errors && errors.length) {
      next(errors[0]);
      deleteFiles();
      return;
    }
    writeWebm(next);
  });
};

function readImages(frames, callback) {
  var done = 0;
  var images = new Array(frames.length);
  var errors = [];
  frames.forEach(function (frame, i) {
    readimage(dataURIBuffer(frame), function (err, image) {
      if (err) {
        errors.push(err);
      }
      images[i] = image;
      done++;
      if (done === frames.length) {
        if (errors.length) {
          return callback(errors);
        }
        return callback(null, images);
      }
    });
  });
}

function writeFile(image, id, frameIndex, callback) {
  writepng(image, function (err, buffer) {
    var writeStream = fs.createWriteStream(TMP_DIR + id + '-' + frameIndex + '.png');

    writeStream.on('error', function (err) {
      return callback(err);
    });
    writeStream.end(buffer, callback);
  });
}

function writeFrames(mediaId, frames, message, callback) {
  readImages(frames, function (err, images) {
    glitch(images, message);
    var done = 0;
    var errors = [];
    for (var i = 0; i < images.length; i++) {
      writeFile(images[i], mediaId, i, function (err) {
        done++;
        if (err) {
          errors.push(err)
        }
        if (done == images.length) {
          if (errors.length) {
            return callback(errors);
          }
          return callback();
        }
      });
    }
  });
}
