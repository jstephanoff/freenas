"use strict";

var _      = require("lodash");
var React  = require("react");
var moment = require("moment");

var StatdMiddleware = require("../../middleware/StatdMiddleware");
var StatdStore      = require("../../stores/StatdStore");

var svgStyle = {
    width   : "calc(100% - 36px)"
  , height  : "100%"
  , "float" : "left"
};

var divStyle = {
    width   : "36px"
  , height  : "100%"
  , "float" : "right"
};

var DummyWidgetContent = React.createClass({

    // TODO: Are these 100% accurate?
    propTypes: {
        statdResources : React.PropTypes.array.isRequired
    }

  , getInitialState: function() {
      return {
          initialData   : false
        , chart         : ""
        , updateCounter : 0
        , graphType     : "line"
        , errorMode     : false
      };
    }

  , componentDidMount: function() {
      var stop  = moment();
      var start = moment().subtract( 15, "m" );

      StatdStore.addChangeListener( this.handleStatdChange );

      this.props.statdResources.forEach( function( resource ) {
        StatdMiddleware.subscribe( resource.dataSource );
      });

      this.props.statdResources.forEach(function(resource) {
        StatdMiddleware.requestWidgetData( resource.dataSource, start.format(),  stop.format(), "10S" );
      });

      this.setState({
          graphType : _.result( _.findWhere( this.props.chartTypes, { "primary": true } ), "type" )
      });
    }

  , componentWillUnmount: function() {
      StatdStore.removeChangeListener( this.handleStatdChange );

      this.props.statdResources.forEach( function( resource ) {
        StatdMiddleware.unsubscribe( resource.dataSource );
      });
    }

  , updateData : function ( target, updateArray ) {

        var updatedData = this.state[target];
        updatedData.push(updateArray);
        if (updatedData.length > 100)
        {
          updatedData.shift();
        }

        this.setState({
          target: updatedData
          });
    }

  , handleStatdChange: function() {
    if ( this.state.initialData === false )
    {
      var newState = {};

      newState.initialData = true;
      this.props.statdResources.forEach(function(resource) {
        newState[resource.variable] = StatdStore.getWidgetData( resource.dataSource );
        if (newState[resource.variable] === undefined)
        {
          newState.initialData = false;
        }
        else
        {
          if (newState[resource.variable].error === true)
          {
            newState.errorMode = true;
            newState.initialData = false;

          }
        }
      });

      this.setState( newState );

      if (this.state.errorMode === true)
      {
        this.render();
        return;
      }

      if (this.state.initialData === true )
      {
        this.drawChart();
      }
    }
    else {
      var ud = StatdStore.getWidgetDataUpdate();
      var updateCounter = this.state.updateCounter;
      var updateFunction = this.updateData;
      if (ud.name)
      {
        var updateArray = [ud.args["timestamp"], ud.args["value"]];
        this.props.statdResources.forEach(function(resource) {
          if (ud.name === "statd." + resource.dataSource + ".pulse")
          {
            updateCounter++;
            updateFunction(resource.variable, updateArray);
          }
        });

        if (updateCounter >= this.props.statdResources.length)
        {
          this.drawChart(true);
          updateCounter = 0;
        }
        this.setState({ "updateCounter" :  updateCounter });
      }
    }

  }

  , drawChart: function( update, reload ) {
      if (reload === true)
      {
        var elmnt = d3.select( this.refs.svg.getDOMNode() );
        elmnt.selectAll("*").remove();
        this.setState({chart : null});
        update = false;
      }

      if (update === true) {
        var chart = this.state.chart;
        d3.select( this.refs.svg.getDOMNode() )
        .datum(this.chartData(this.state.graphType))
        .call(chart);
        chart.update();
        this.setState({"chart" : chart});
        //this.state.chart.update();
      }
      else {
        var chart;
        var graphTypeObject;

        if (this.state.graphType === "stacked")
        {
          graphTypeObject = this.selectObjectFromArray(this.props.chartTypes, "stacked");
          chart = nv.models.stackedAreaChart()
            .options({
               margin                     :    {top: 15, right: 40, bottom: 60, left: 60}
              ,x                          :    graphTypeObject.x || function(d) { if(d[0] === "nan") { return null; } else { return d[0]; } }   //We can modify the data accessor functions...
              ,y                          :    graphTypeObject.y || function(d) { if(d[1] === "nan") { return null; } else { return d[1]; } }   //...in case your data is formatted differently.
              ,transitionDuration         :    250
              ,style                      :    "Expanded"
              ,showControls               :    false       //Allow user to choose 'Stacked', 'Stream', 'Expanded' mode.
              ,clipEdge                   :    false
              ,useInteractiveGuideline    :    false    //Tooltips which show all data points. Very nice!
            });

          // chart sub-models (ie. xAxis, yAxis, etc) when accessed directly, return themselves, not the parent chart, so need to chain separately
          var xLabel = graphTypeObject.xLabel || "Time";
          chart.xAxis
            .axisLabel(xLabel)
            .tickFormat(function(d) {
              return moment.unix(d).format("HH:mm:ss");
            });

          var yUnit = graphTypeObject.yUnit || "";
          chart.yAxis
            .axisLabel(graphTypeObject.yLabel)
            .tickFormat(function(d) {
              return (d + yUnit);
            });


        }
        else if (this.state.graphType === "line")
        {
          graphTypeObject = this.selectObjectFromArray(this.props.chartTypes, "line");
          chart = nv.models.lineChart()
          .options({
             margin                       :   {top: 15, right: 40, bottom: 60, left: 60}
            ,x                            :   graphTypeObject.x || function(d) { if(d[0] === "nan") { return null; } else { return d[0]; } }
            ,y                            :   graphTypeObject.y || function(d) { if(d[1] === "nan") { return null; } else { return d[1]; } }
            ,showXAxis                    :   true
            ,showYAxis                    :   true
            ,transitionDuration           :   250
            ,forceY                       :   graphTypeObject.forceY //[0, 100]
            ,useInteractiveGuideline      :   true
          });

          // chart sub-models (ie. xAxis, yAxis, etc) when accessed directly, return themselves, not the parent chart, so need to chain separately
          var xLabel = graphTypeObject.xLabel || "Time";
          chart.xAxis
            .axisLabel(xLabel)
            .tickFormat(function(d) {
              return moment.unix(d).format("HH:mm:ss");
            });

          var yUnit = graphTypeObject.yUnit || "";
          chart.yAxis
            .axisLabel(graphTypeObject.yLabel)
            .tickFormat(function(d) {
              return (d + yUnit);
            });



        }
        else if (this.state.graphType === "pie")
        {
          graphTypeObject = this.selectObjectFromArray(this.props.chartTypes, "pie");
          var colors = [];
          this.props.statdResources.forEach(function(resource) {
            colors.push(resource.color);
          });
          chart = nv.models.pieChart()
          .options({
             margin                       :   {top: 0, right: 0, bottom: 0, left: 0}
            ,x                            :   graphTypeObject.x || function(d) { return d.label; }
            ,y                            :   graphTypeObject.y || function(d) { if(d.value === "nan") { return 0; } else { return d.value; } }
            ,color                        :   colors
            ,showLabels                   :   true
            ,labelThreshold               :   1
            ,labelType                    :   "value" //Configure what type of data to show in the label. Can be "key", "value" or "percent"
            ,transitionDuration           :   250
            ,donut                        :   false
            ,donutRatio                   :   0.35
          });
        }
        else
        {
          console.log(this.state.graphType + " is not a supported chart type.");
          return;
        }

      d3.select( this.refs.svg.getDOMNode() )
        .datum(this.chartData(this.state.graphType))
        .call(chart);

      //TODO: Figure out a good way to do this automatically
      //nv.utils.windowResize(chart.update);
      //nv.utils.windowResize(function() { d3.select('#chart1 svg').call(chart) });

      //chart.dispatch.on('stateChange', function(e) { nv.log('New State:', JSON.stringify(e)); });
      this.setState({ "chart" : chart
                      ,fullUpdate : false });
    }
    }

  , chartData: function( chartType ) {
    var returnArray = [];
    var state = this.state;

    if (chartType === "line")
    {
      this.props.statdResources.forEach(function(resource) {
        var returnArrayMember = {
                                    area: resource.area || false
                                  , values: state[resource.variable]
                                  , key: resource.name
                                  , color: resource.color
                                };
        returnArray.push(returnArrayMember);
      });
    }
    else if (chartType === "stacked")
    {
      this.props.statdResources.forEach(function(resource) {
        var returnArrayMember = {
                                    values: state[resource.variable]
                                  , key: resource.name
                                  , color: resource.color
                                };
        returnArray.push(returnArrayMember);
      });
    }
    else if (chartType === "pie")
    {
      this.props.statdResources.forEach(function(resource) {
        var returnArrayMember = {
                                    value: state[resource.variable][state[resource.variable].length - 1][1]
                                  , label: resource.name
                                };
        returnArray.push(returnArrayMember);
      });
    }
    return returnArray;
    }

  , selectObjectFromArray: function( objectArray, valueToTest ) {
    var match = {};
    var i = 0;
    length = objectArray.length;

    for (; i < length; i++)
    {
      for (var property in objectArray[i])
      {
        if (objectArray[i][property] === valueToTest)
        {
          match = objectArray[i];
        }
      }
    }

    return match;
    }


  , returnErrorMsgs: function( resource, index ) {
      var errorMsg;

      if ( this.state[ resource.variable ] && this.state[ resource.variable ].msg ) {
        errorMsg = resource.variable + ": " + this.state[ resource.variable ].msg;
      } else {
        errorMsg = "OK";
      }

      return (
        <div key={ index } >{ errorMsg }</div>
      );
    }

  , returnGraphOptions: function( resource, index ) {
      return (
        <div
          key          = { index }
          className    = { "ico-graph-type-" + resource.type }
          onTouchStart = { this.togleGraph }
          onClick      = { this.togleGraph }>
            { resource.type }
        </div>
      );
    }

  , togleGraph: function(e) {
    var drwChrt = this.drawChart;
    this.setState({graphType : e.target.textContent}, function() { drwChrt(false, true); });
    }

  , render: function() {
      if ( this.state.errorMode ) {
        return (
          <div className="widget-error-panel">
            <h4>Something went sideways.</h4>
            { this.props.statdResources.map( this.returnErrorMsgs, this ) }
          </div>
        );
      } else {
        return (
          <div className="widget-content">
            <svg ref="svg" style={svgStyle}></svg>
            <div ref="controls" style={divStyle}>
              { this.props.chartTypes.map( this.returnGraphOptions ) }
            </div>
          </div>
        );
      }
    }

});

module.exports = DummyWidgetContent;