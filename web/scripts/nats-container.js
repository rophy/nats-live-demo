// -- note drawing-container.js must be included above this module

import { connect, StringCodec } from './nats.js'
import { EventPublisherDrawingContainer, EventSubscriberDrawingContainer } from './drawing-container.js'

const sc = StringCodec();

// a global incrementing counter for troubleshooting convinence.
let globalInstanceId = 0;

/**
 * extend the basic point drawing canvas so that instances listen for
 * messages on the given NATS instance which are then drawn as points
 */
class NATSSubscriberDrawingContainer extends EventSubscriberDrawingContainer
{
    constructor(counterElementName,
                configuration,
                statisticsCallback
              )
    {
        super(counterElementName, configuration, statisticsCallback);
        this.instanceId = `subscriber_${++globalInstanceId}`;
    }

    // -- receiver methods

    async startWebSocket(onConnectedCallback)
    {
        try {
            this.nc = await connect({ servers: this.configuration.nats_url });
            console.log(this.instanceId, `connected to ${this.nc.getServer()}`);
            onConnectedCallback();
        } catch (err) {
            return onConnectedCallback(err);
        }

        const sub = this.nc.subscribe(this.configuration.topic, {
            queue: this.configuration.enableQueueGroup ? this.configuration.queue : null
        });
        for await (const m of sub) {
            let point = JSON.parse(sc.decode(m.data));
            console.log(this.instanceId, sub.getProcessed(), point);
            this.processMessage(point);
            await new Promise(r => setTimeout(r, this.configuration.delay));
        }
        console.log(this.instanceId, "subscription closed");
    }

    async stopWebSocket() {
        if (this.nc) {
            await this.nc.close();
            await this.nc.closed();
            console.log(this.instanceId, 'connection closed.');
        }
    }


}

/**
 * extend the basic point drawing canvas so that instances listen for
 * messages on the given NATS instance which are then drawn as points
 */
class NATSPublisherDrawingContainer extends EventPublisherDrawingContainer
{
    constructor(counterElementName,
                configuration,
                statisticsCallback
              )
    {
        super(counterElementName, configuration, statisticsCallback);
        this.instanceId = `publisher_${++globalInstanceId}`;

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

            async function pointIdleDispatch(point)
            {
                let payload = { x:x, y:y, timestamp: new Date().getTime(), c: self.configuration.color};
                await self.nc.publish(
                  self.configuration.topic,
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

    async startWebSocket(onConnectedCallback)
    {
        try {
            this.nc = await connect({ servers: this.configuration.nats_url });
            console.log(this.instanceId, `connected to ${this.nc.getServer()}`);
            onConnectedCallback();
        } catch (err) {
            console.error(err);
            onConnectedCallback(err);
        }
    }

    async stopWebSocket() {
        if (this.nc) {
            await this.nc.close();
            await this.nc.closed();
            console.log(this.instanceId, 'connection closed.');
        }
    }

}

export { NATSPublisherDrawingContainer, NATSSubscriberDrawingContainer };