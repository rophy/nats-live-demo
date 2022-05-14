var config = {

	"NATS_URL": "ws://localhost:8080",

	"NATS_TOPIC": "drawing",

	"Region" : "ap-northeast-1",

	"Cognito" : {
		"IdentityPoolId": "REPLACE_WITH_COGNITO_IDENTITY_POOL_ID"
	},

	"SQS" : {
		"Standard" : {
			"QueueUrl" : "REPLACE_WITH_QUEUE_URL_1"
		},
		"Secondary" : {
			"QueueUrl" : "REPLACE_WITH_QUEUE_URL_2"
		},
		"Tertiary" : {
			"QueueUrl" : "REPLACE_WITH_QUEUE_URL_3"
		},
		"FIFO" : {
			"QueueUrl" : "REPLACE_WITH_QUEUE_URL_FIFO",
			"GroupId" : "idevelop_sqs_fifo"
		}
	},

	"SNS" : {
		"TopicARN" : "REPLACE_WITH_SNS_TOPIC_ARN"
	},

	"Kinesis" : {
		"StreamName" 		: "iDevelopDrawingData",
		"PartitionKey"	: "Partition1"
	},

	"IoT" : {
		"Endpoint" : "REPLACE_WITH_IOT_ENDPOINT",
		"Topic" : "idevelop/drawingdemo"
	}
}

export { config };
