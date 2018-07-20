/****************************************************

Sample TIQK Power Query M script
========

This Power Query M script generates an Auth Token and performs a call to obtain the folders list
from a TIQK organisation's account. It then drills into one of the Team Folders and extracts the file list
and metadata.

The Query can be used to support live, custom visualisations, mashups, and analysis of TIQK platform data
in Microsoft PowerBI and Excel 2016.

USAGE
=====
Requires a TIQK account and a generated TIQK API Key & Secret.

For development and testing TIQK provides subscribers a free Sandbox and API endpoints with
access and usage limits. API activity on your production account may incur charges.


SECURITY
========

The TIQK API Key and Secret credentials should be treated as passwords and not distributed. 
Example credentials in this query are not securely stored. We recommend you consult
the Power Query documentation for advice on how to securely parameterise and store your credentials.

Web data source privacy levels for the TIQK URLs are set to "None" for ease of demonstration. We recommend
you consult the Power Query documentation for advice on suitable privacy and security settings in any
live implementation.


RESOURCES
=========
TIQK API documentation: https://api-docs.tiqk.com

API Terms of Service: https://help.tiqk.io/terms-privacy-security-and-data/tiqk-api-terms-of-service

Query overview: https://docs.microsoft.com/en-us/power-bi/desktop-query-overview

Power Query M Reference: https://msdn.microsoft.com/en-us/library/mt211003.aspx


COPYRIGHT NOTICE
================
Copyright 2018 TIQK Pty Limited. All rights reserved.

****************************************************/

let
 
    // Obtain a valid AuthToken
   
    // Concatenate the organisation's TIQK API Key & Secret, and convert to base64
    
    // If you are using named Query Parameters, use the following string format
    // (This assumes you have 2 parameters named: APIKey, APISecret)
    // apiKeySecretConcatenated = #"APIKey" & ":" & #"APISecret",
    
    apiKeySecretConcatenated = "<your API Key>" & ":" & "<your API Secret>",
    
    authKey = "Basic " & Binary.ToText(Text.ToBinary(apiKeySecretConcatenated),0),
    url = "https://public-api.tiqk.io/v1/oauth/token",
    content = "{""method"": ""post""}",
   
    GetJson = Web.Contents(url,
        [
            Headers = [
                #"Authorization"=authKey,
                #"Content-Type"="application/json"
            ],
            Content=Text.ToBinary(content)
        ]
    ),
 
    // Get token from the JSON response
    FormatAsJson = Json.Document(GetJson),
    AccessToken = FormatAsJson[token],
    AccessTokenHeader = "Bearer " & AccessToken,
 
    // Now that we have a valid AuthToken, make a call to obtain
    // the organisation's list of folders and uploaded files
    // For details on the call and response, see api-docs.tiqk.com
 
    GetJsonQuery = Web.Contents("https://public-api.tiqk.io/v1/folders?includeFiles=true",
        [
            Headers = [#"Authorization"=AccessTokenHeader]
        ]
    ),
 
    // Response includes all Team and Shared ('global') folders
    AllFolders = Json.Document(GetJsonQuery),
   
    // Drill down into the first folder (in this case, called "A Team") in the Team folders group
    TeamFoldersRoot = AllFolders{0},
    TeamFoldersList = TeamFoldersRoot[subFolders],
    A_TeamFolder = TeamFoldersList{0},
   
    // Drill down to the list of files in the "A Team" folder
    A_TeamFolder_Files = A_TeamFolder[files],
   
    // Expand the file list into a table for use in PowerBI or Excel
    ConvertToTable = Table.FromList(A_TeamFolder_Files, Splitter.SplitByNothing(), null, null, ExtraValues.Error),
    ExpandedFileList = Table.ExpandRecordColumn(ConvertToTable, "Column1", {"fileId", "name", "size", "uploadedAt", "lastAuditResult", "lastAuditAt"}, {"file.fileId", "file.name", "file.size", "file.uploadedAt", "file.lastAuditResult", "file.lastAuditAt"})

in
    // Return the file list
    ExpandedFileList