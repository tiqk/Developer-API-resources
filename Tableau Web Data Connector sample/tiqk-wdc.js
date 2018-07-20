(function() {
  // Globals
  var environmentBaseURL = 'https://public-api.tiqk.io/'; // If testing, use https://stage-api.tiqk.io/v1/ instead to avoid usage charges. Contact TIQK to configure first.
  var tiqkAPIVersion = 'v1';
  var authURL = environmentBaseURL + tiqkAPIVersion + '/oauth/token';
  var filesURL = environmentBaseURL + tiqkAPIVersion + '/folders?includeFiles=true';
  var auditResultsURL = environmentBaseURL + tiqkAPIVersion + '/audit/results/';

  var apiKey = '<your apiKey here>'; // IMPORTANT: Don't save this in source code that can be publicly accessed!
  var apiSecret = '<your apiSecret here>'; // IMPORTANT: Don't save this in source code that can be publicly accessed!
  var folderType = 'Teams'; // Type of folder where files are located: 'Teams' or 'Global' (a.k.a. shared)
  var subFolderName = 'A Team'; // Name of the subfolder that contains the files with audit results to be returned to Tableau
  var tableauWDCAlias = 'Audit results for folder: ' + subFolderName;

  var bearerToken = '';

  // Create the connector object
  var myConnector = tableau.makeConnector();

  // Define the schema
  myConnector.getSchema = function(schemaCallback) {
    var cols = [
      {
        id: 'folderId',
        alias: 'Folder id',
        dataType: tableau.dataTypeEnum.int
      },
      {
        id: 'folderName',
        alias: 'Folder name',
        dataType: tableau.dataTypeEnum.string
      },
      {
        id: 'folderDesc',
        alias: 'Folder description',
        dataType: tableau.dataTypeEnum.string
      },
      {
        id: 'folderLastUpdatedAt',
        alias: 'Folder last updated',
        dataType: tableau.dataTypeEnum.datetime
      },
      {
        id: 'fileId',
        alias: 'File id',
        dataType: tableau.dataTypeEnum.int
      },
      {
        id: 'fileName',
        alias: 'File name',
        dataType: tableau.dataTypeEnum.string
      },
      {
        id: 'fileSize',
        alias: 'File size',
        dataType: tableau.dataTypeEnum.float
      },
      {
        id: 'fileUploadedAt',
        alias: 'File uploaded',
        dataType: tableau.dataTypeEnum.datetime
      },
      {
        id: 'fileLastAuditAt',
        alias: 'File last audited',
        dataType: tableau.dataTypeEnum.datetime
      },
      {
        id: 'fileOverallComplianceResult',
        alias: 'File overall audit result',
        dataType: tableau.dataTypeEnum.string
      },
      {
        id: 'fileRiskRating',
        alias: 'File regulatory Risk Rating',
        dataType: tableau.dataTypeEnum.float
      },
      {
        id: 'fileFinancialAdviser',
        alias: 'File Financial Adviser name',
        dataType: tableau.dataTypeEnum.string
      },
      {
        id: 'fileFinancialAdviserId',
        alias: 'File Financial Adviser ID',
        dataType: tableau.dataTypeEnum.int
      },
      {
        id: 'fileTotalCompliant',
        alias: 'File total (Regulatory) Compliant attributes',
        dataType: tableau.dataTypeEnum.int
      },
      {
        id: 'fileTotalNonCompliant',
        alias: 'File total (Regulatory) Non-compliant attributes',
        dataType: tableau.dataTypeEnum.int
      },
      {
        id: 'fileTotalUnknown',
        alias: 'File total (Regulatory) Unknown attributes',
        dataType: tableau.dataTypeEnum.int
      },
      {
        id: 'fileTotalAdvice',
        alias: 'File total (Regulatory) Advice attributes',
        dataType: tableau.dataTypeEnum.int
      }
    ];

    var tableSchema = {
      id: 'TIQKdata',
      alias: tableauWDCAlias,
      columns: cols
    };

    schemaCallback([tableSchema]);
  };

  // Download the data
  myConnector.getData = function(table, doneCallback) {
    // Get the auth token first
    $.ajax({
      url: authURL,
      type: 'POST',
      dataType: 'json',
      success: function(response) {
        // tableau.log('resp: ' + response.token);
        bearerToken = response.token;

        // Obtain the list of Global ("shared") and Team folders in the account
        $.ajax({
          url: filesURL,
          type: 'GET',
          dataType: 'json',
          success: function(response) {
            //tableau.log('resp: ' + response);

            // Iterate through to the Team folder named "A Team"
            // and get the list of files inside it
            // For those that have been audited, return audit results for each
            // (ignore any that have not been audited)
            var rootFolders = response; // Contains the arrays of Global (shared) and Team folders and files in the TIQK account
            var tempFileList = [];
            var fileList = [];
            var fileAuditResults = [];

            for (var i = 0, len = rootFolders.length; i < len; i++) {
              if (rootFolders[i].folderName == folderType) {
                var teamSubFolders = rootFolders[i].subFolders;
                for (var x = 0, len = teamSubFolders.length; x < len; x++) {
                  // If we find the target subfolder in here, extract the list of files inside it
                  if (teamSubFolders[x].folderName == subFolderName) {
                    var filesInATeamSubfolder = teamSubFolders[x].files;

                    // Extract this subfolder's metdata and list of files into our table schema for Tableau
                    var auditedFileIdsArray = [];

                    for (var y = 0, len = filesInATeamSubfolder.length; y < len; y++) {
                      // Only interested in files that have been audited
                      var fileAuditDate = filesInATeamSubfolder[y].lastAuditAt;
                      if (fileAuditDate != null) {
                        tempFileList.push({
                          folderId: teamSubFolders[x].folderId,
                          folderName: teamSubFolders[x].folderName,
                          folderDesc: teamSubFolders[x].folderDesc,
                          folderLastUpdatedAt: teamSubFolders[x].lastUpdatedAt,
                          fileId: filesInATeamSubfolder[y].fileId,
                          fileName: filesInATeamSubfolder[y].name,
                          fileSize: filesInATeamSubfolder[y].size,
                          fileUploadedAt: filesInATeamSubfolder[y].uploadedAt,
                          fileLastAuditAt: fileAuditDate,
                          fileOverallComplianceResult: filesInATeamSubfolder[y].lastAuditResult
                        });

                        // update the list of fileIds (used below when retrieving audit results)
                        auditedFileIdsArray.push(filesInATeamSubfolder[y].fileId);
                      }
                    }

                    // Now obtain the audit results for each audited file, and update the array with those results.
                    // The getAuditResults TIQK API call accepts a list of fileIds, and quickly returns a list of
                    // matching audit results in the same order as the fileId list.
                    var auditedFileIds = auditedFileIdsArray.join(','); // API call requires a comma-separated string list

                    $.ajax({
                      url: auditResultsURL + auditedFileIds,
                      type: 'GET',
                      dataType: 'json',
                      success: function(response) {
                        // The response contains a array of audit results in the same order as the fileIds submitted
                        // Add these to the metadata previously captured for the file list
                        // for the final table population
                        for (var z = 0, len = response.length; z < len; z++) {
                          fileList.push({
                            fileFinancialAdviser: response[z].publisher.name,
                            fileFinancialAdviserId: response[z].publisher.number,
                            fileRiskRating: response[z].riskRating,
                            fileTotalCompliant: response[z].totalCompliant,
                            fileTotalNonCompliant: response[z].totalNonCompliant,
                            fileTotalAdvice: response[z].totalAdvice,
                            fileTotalUnknown: response[z].totalUnknown,

                            folderId: tempFileList[z].folderId,
                            folderName: tempFileList[z].folderName,
                            folderDesc: tempFileList[z].folderDesc,
                            folderLastUpdatedAt: tempFileList[z].folderLastUpdatedAt,
                            fileId: tempFileList[z].fileId,
                            fileName: tempFileList[z].fileName,
                            fileSize: tempFileList[z].fileSize,
                            fileUploadedAt: tempFileList[z].fileUploadedAt,
                            fileLastAuditAt: tempFileList[z].fileLastAuditAt,
                            fileOverallComplianceResult: tempFileList[z].fileOverallComplianceResult
                          });
                        }

                        table.appendRows(fileList);
                        doneCallback();
                        return; // We don't need to process any more subfolders
                      },
                      error: function(error) {
                        tableau.log('Error retrieving audit results from file list: ' + error.responseText);
                        doneCallback();
                      },
                      beforeSend: setBearerHeader
                    });
                    break; // No need to loop further as we've already found (or not) our subfolder
                  } else {
                    // We didn't find the subfolder
                    tableau.log('Error: Folder "' + subFolderName + '" not found in this TIQK account');
                    doneCallback();
                    return; // We don't need to process any more subfolders
                  }
                }
              }
            }
          },
          error: function(error) {
            tableau.log('Error retrieving folders and files from TIQK account: ' + error.responseText);
            doneCallback();
          },
          beforeSend: setBearerHeader
        });
      },
      error: function(error) {
        tableau.log('Authorization Error: ' + error.responseText);
        doneCallback();
      },
      beforeSend: setAuthHeader
    });
    function setAuthHeader(xhr) {
      var base64EncKeySecret = btoa(apiKey + ':' + apiSecret);
      xhr.setRequestHeader('Authorization', 'Basic ' + base64EncKeySecret);
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
    function setBearerHeader(xhr) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + bearerToken);
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
  };

  tableau.registerConnector(myConnector);

  // Create event listeners for when the user submits the form
  $(document).ready(function() {
    $('#submitButton').click(function() {
      tableau.connectionName = 'TIQK data feed';
      tableau.submit();
    });
  });
})();
