// -- note drawing-container.js must be included above this module

import { connect, StringCodec } from './nats.js'
import { EventPublisherDrawingContainer, EventSubscriberDrawingContainer } from './drawing-container.js'

const sc = StringCodec();

/**
 * extend the basic point drawing canvas so that instances listen for
 * messages on the given MQTT instance which are then drawn as points
 */
class MQTTSubscriberDrawingContainer extends EventSubscriberDrawingContainer
{
    constructor(counterElementName,
                configuration,
                statisticsCallback
              )
    {
        super(counterElementName, configuration, statisticsCallback);
    }

    // -- receiver methods

    async startWebSocket(onConnectedCallback)
    {
        this.nc = await connect({ servers: this.configuration.NATS_URL });
        console.log(`connected to ${this.nc.getServer()}`);
        onConnectedCallback();

        const sub = this.nc.subscribe(this.configuration.NATS_TOPIC);
        for await (const m of sub) {
            let point = JSON.parse(sc.decode(m.data));
            console.log(sub.getProcessed(), point);
            this.processMessage(point);
        }
        console.log("subscription closed");
    }

}

/**
 * extend the basic point drawing canvas so that instances listen for
 * messages on the given MQTT instance which are then drawn as points
 */
class MQTTPublisherDrawingContainer extends EventPublisherDrawingContainer
{
    constructor(counterElementName,
                configuration,
                statisticsCallback
              )
    {
        super(counterElementName, configuration, statisticsCallback);

        var self = this;
        this.nc = null;

        this.canvas.node.onmousemove = function(e)
        {
            if(!self.isDrawing)
            {
                return;
            }

            self.lastMouseMoveTime = e.timeStamp;

            var x = e.clientX - self.offset(this).left;
            var y = e.clientY - self.offset(this).top;

            function pointIdleDispatch(point)
            {
                let payload = { x:x, y:y, timestamp: new Date().getTime(), clear:false };
                self.nc.publish(
                  self.configuration.NATS_TOPIC,
                  sc.encode(JSON.stringify(payload))
                );
                self.statistics.MessagesSent++;
                self.BroadcastStatistics();
            }

            window.setTimeout(pointIdleDispatch, {x:x, y:y});
            self.drawPoint(x,y);
        };

        this.canvas.node.onmousedown = function(e)
        {
            self.isDrawing = true;
        };

        this.canvas.node.onmouseup = function(e)
        {
            self.isDrawing = false;
        };

        // send clicks through as a single mouse move
        this.canvas.node.onclick = function(e)
        {
            self.isDrawing = true;
            self.canvas.node.onmousemove(e);
            self.isDrawing = false;
        };
    }

    clearCanvas()
    {
        super.clearCanvas();
        let payload = { x:0, y:0, timestamp: new Date().getTime(), clear:true };
        this.nc.publish(
            this.configuration.NATS_TOPIC,
            sc.encode(JSON.stringify(payload))
        );
    }

    async startWebSocket(onConnectedCallback)
    {
        this.nc = await connect({ servers: this.configuration.NATS_URL });
        console.log(`connected to ${this.nc.getServer()}`);
        onConnectedCallback();
    }
}

export { MQTTPublisherDrawingContainer, MQTTSubscriberDrawingContainer };