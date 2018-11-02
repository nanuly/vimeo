/*
Copyright 2015 Google Inc. All Rights Reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var signinCallback = function (result){
  if(result.access_token) {
    var uploadVideo = new UploadVideo();
    uploadVideo.ready(result.access_token);
  }
};

var STATUS_POLLING_INTERVAL_MILLIS = 60 * 1000; // One minute.


/**
 * YouTube video uploader class
 *
 * @constructor
 */
var UploadVideo = function() {
  /**
   * The array of tags for the new YouTube video.
   *
   * @attribute tags
   * @type Array.<string>
   * @default ['google-cors-upload']
   */
  this.tags = ['youtube-cors-upload'];

  /**
   * The numeric YouTube
   * [category id](https://developers.google.com/apis-explorer/#p/youtube/v3/youtube.videoCategories.list?part=snippet&regionCode=us).
   *
   * @attribute categoryId
   * @type number
   * @default 22
   */
  this.categoryId = 22;

  /**
   * The id of the new video.
   *
   * @attribute videoId
   * @type string
   * @default ''
   */
  this.videoId = '';

  this.uploadStartTime = 0;
};


UploadVideo.prototype.ready = function(accessToken) {
  this.accessToken = accessToken;
  this.gapi = gapi;
  this.authenticated = true;
  this.gapi.client.request({
    path: '/youtube/v3/channels',
    params: {
      part: 'snippet',
      mine: true
    },
    callback: function(response) {
      if (response.error) {
        console.log(response.error.message);
      } else {
        $('#channel-name').text(response.items[0].snippet.title);
        $('#channel-thumbnail').attr('src', response.items[0].snippet.thumbnails.default.url);

        $('.pre-sign-in').hide();
        $('.post-sign-in').show();
      }
    }.bind(this)
  });
  $('#btn-ytb-upload').on("click", this.handleUploadClicked.bind(this));
};


/**
 * Uploads a video file to YouTube.
 *
 * @method uploadFile
 * @param {object} file File object corresponding to the video to upload.
 */
UploadVideo.prototype.uploadFile = function(file) {
  var metadata = {
    snippet: {
      title: $('#title').val(),
      description: $('#description').val(),
      tags: this.tags,
      categoryId: this.categoryId
    },
    status: {
      privacyStatus: $('#privacy-status option:selected').val()
    }
  };
  var uploader = new MediaUploader({
    baseUrl: 'https://www.googleapis.com/upload/youtube/v3/videos',
    file: file,
    token: this.accessToken,
    metadata: metadata,
    params: {
      part: Object.keys(metadata).join(',')
    },
    onError: function(data) {
      var message = data;
      // Assuming the error is raised by the YouTube API, data will be
      // a JSON string with error.message set. That may not be the
      // only time onError will be raised, though.
      try {
        var errorResponse = JSON.parse(data);
        message = errorResponse.error.message;
      } finally {
        alert(message);
      }
    }.bind(this),
    onProgress: function(data) {

        var currentTime = Date.now();
        var bytesUploaded = data.loaded;
        var totalBytes = data.total;
  
        // The times are in millis, so we need to divide by 1000 to get seconds.
        var bytesPerSecond = bytesUploaded / ((currentTime - this.uploadStartTime) / 1000);
        var estimatedSecondsRemaining = (totalBytes - bytesUploaded) / bytesPerSecond;
        var percentageComplete = Math.floor(bytesUploaded/ totalBytes * 100);
  
        //      $('#upload-progress').attr({
        //        value: bytesUploaded,
        //        max: totalBytes
        //      });
            
        $('#progress-bar-youtube').css('width', percentageComplete+'%');
        $('#progress-bar-youtube').attr("aria-valuenow", percentageComplete);
        $('#progress-bar-youtube').text(percentageComplete+"%");	
    
        //$('#percent-transferred').text(percentageComplete);
        $('#bytes-transferred').text(bytesUploaded);
        $('#total-bytes').text(totalBytes);
    
        $('.during-upload').show();
    }.bind(this), 
    onComplete: function(data) {
        var uploadResponse = JSON.parse(data);
        this.videoId = uploadResponse.id;
        //var videoThumb = uploadResponse.snippet.thumbnails.high.url;
        //$('#video-id').text(this.videoId);
        $('#inputarea').append('<p class="youtube"><iframe width="100%" height="100%" src="https://www.youtube.com/embed/' + this.videoId + '" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe><br></p><br>'); //게시글에 등록
        modalDataInit();      
        //      $('.post-upload').show();
        //      this.pollForVideoStatus();
      }.bind(this)

  });
  // This won't correspond to the *exact* start of the upload, but it should be close enough.
  this.uploadStartTime = Date.now();
  uploader.upload();
};

UploadVideo.prototype.handleUploadClicked = function() {
    if($('#file-youtube').get(0).files.length === 0) {
        alert('업로드할 동영상을 선택해주세요.');
        return;
    }
    
    if($('#title').val() === '') {
        alert('동영상의 제목을 입력해주세요.');
        return;
    }
    $('#btn-ytb-upload').attr('disabled', true);
    this.uploadFile($('#file-youtube').get(0).files[0]);
};

UploadVideo.prototype.pollForVideoStatus = function() {
  this.gapi.client.request({
    path: '/youtube/v3/videos',
    params: {
      part: 'status,player',
      id: this.videoId
    },
    callback: function(response) {
      if (response.error) {
        // The status polling failed.
        console.log(response.error.message);
        setTimeout(this.pollForVideoStatus.bind(this), STATUS_POLLING_INTERVAL_MILLIS);
      } else {
        var uploadStatus = response.items[0].status.uploadStatus;
        switch (uploadStatus) {
          // This is a non-final status, so we need to poll again.
          case 'uploaded':
            $('#post-upload-status').append('<li>Upload status: ' + uploadStatus + '</li>');
            setTimeout(this.pollForVideoStatus.bind(this), STATUS_POLLING_INTERVAL_MILLIS);
            break;
          // The video was successfully transcoded and is available.
          case 'processed':
            $('#player').append(response.items[0].player.embedHtml);
            $('#post-upload-status').append('<li>Final status.</li>');
            break;
          // All other statuses indicate a permanent transcoding failure.
          default:
            $('#post-upload-status').append('<li>Transcoding failed.</li>');
            break;
        }
      }
    }.bind(this)
  });
};







function modalDataInit(){
	
    jQuery('#youtubeModal').modal('hide');
    //$('#id').modal('hide'); 의 경우 외부 js파일에서 제대로 실행이 되지 않아 $대신 jQuery 사용

    $('#title').val("");
    $('#description').val("");
    $('#file-youtube').val("");
    $('label[for=file-youtube]').text("파일 선택");
    
    $('#progress-bar-youtube').css('width', '0%');
    $('#progress-bar-youtube').attr("aria-valuenow", 0);
    $('#progress-bar-youtube').text("");	
    
    $('#btn-ytb-upload').attr('disabled', false);
    
    $('#bytes-transferred').text(0);
    $('#total-bytes').text(0);
    $('.during-upload').hide();
    
}




