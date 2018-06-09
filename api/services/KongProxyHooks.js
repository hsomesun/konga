'use strict';

var _ = require('lodash');
var URL = require('url');

var self = module.exports = {

  isUpdateEntityRequest: function(entity, req) {
    var parts = req.url.split("/").filter(function (e) {return e;});
    return parts.length === 2 && parts[0] === entity && req.method === 'PATCH';
  },

  isListEntityRequest: function(entity, req) {
    var parsedUrl = URL.parse(req.url);
    return parsedUrl.pathname === '/services' && req.method === 'GET'
  },

  isFetchEntityRequest: function(entity, req) {
    var parts = req.url.split("/").filter(function (e) {return e;});
    return parts.length === 2 && parts[0] === 'services' && req.method === 'GET';
  },

  isCreateEntityRequest: function(entity, req) {
    var parts = req.url.split("/").filter(function (e) {return e;});
    return parts.length === 1 && parts[0] === 'services' && req.method === 'POST';
  },

  isDeleteEntityRequest: function(entity, req) {
    var parts = req.url.split("/").filter(function (e) {return e;});
    return parts.length === 2 && parts[0] === 'services' && req.method === 'DELETE'
  },

  beforeSend: function (req, next) {
    sails.log.debug("KongProxyHooks:beforeSend")


    if(self.isUpdateEntityRequest('services', req)) {
      var kong_node_id = req.connection.id;
      if(req.body.extras) {
        sails.log.debug("extras", req.param("id"))
        sails.models.kongserviceextra.updateOrCreate({
          kong_node_id: kong_node_id,
          service_id: req.param("id")
        },_.merge(req.body.extras, {
          kong_node_id: kong_node_id,
            service_id: req.param("id")
        }), function (err, extras) {
          if(err) {
            sails.log.error(err);
            return next(err);
          }
          // Delete the extras attr
          delete req.body.extras;
          return next();
        });
      }else{
        return next();
      }
    } else {
      return next();
    }
  },

  afterEntityDeleted: function(entityId, req, next) {

  },


  afterResponseSuccess : function (resBody, req, next) {
    sails.log.debug("KongProxyHooks:afterResponseSuccess", req.method)
    var parsedUrl = URL.parse(req.url);
    sails.log.debug("parsedUrl", parsedUrl);
    var parts = req.url.split("/").filter(function(e){return e});
    sails.log.debug("req.url parts", parts);
    if(self.isFetchEntityRequest('services', req))
    {
      var service = resBody;
      sails.log.debug("THIS IS A GET REQUEST FOR A SPECIFIC SERVICE =>", service)
      sails.models.kongserviceextra.findOne({
        service_id: service.id,
        kong_node_id: req.connection.id
      },function (err, extras) {
        if(err) {
          sails.log.error(err);
          return next(err);
        }
        return next(null, _.merge(resBody, {extras: extras}));
      })

    }
    else if(self.isListEntityRequest('services', req))
    {
      sails.log.debug("THIS IS A GET REQUEST FOR SERVICES LIST")
      sails.models.kongserviceextra.find({
        kong_node_id: req.connection.id
      },function (err, extras) {
        if(err) {
          sails.log.error(err);
          return next(null,resBody); // let it pass without the extra appends. No need to block the response
        }

        // Assign the extras to the services
        resBody.data.forEach(function (service) {
          service.extras = _.find(extras, function (extra) {
            return extra.service_id === service.id
          }) || {}
        })
        return next(null,resBody);
      })


    }
    else if(self.isCreateEntityRequest('services', req))
    {
      sails.log.debug("THIS IS A POST REQUEST TO CREATE A NEW SERVICE")
      if(resBody.extras) {
        sails.models.kongserviceextra.create(_.merge({
          kong_node_id: req.connection.id,
          service_id: resBody.id
        }, resBody.extras),function (err, extras) {
          if(err) {
            sails.log.error(err);
            return next(null,resBody); // let it pass without the extra appends. No need to block the response
          }
          return next(null,_.merge(resBody,{extras: extras}));
        })
      }else{
        return next(null,resBody);
      }

    }
    else if(self.isDeleteEntityRequest('services', req)) {

      sails.log.debug("THIS IS A DELETE SERVICE REQUEST: service_id =>", parts[1])

      sails.models.kongserviceextra.destroy({
        kong_node_id: req.connection.id,
        service_id: parts[1]
      },function (err) {
        if(err) {
          sails.log.error("Failed to remove kong service extras",err);
          return next(err);
        }

        return next(null, resBody);
      })

    }  else{
      return next(null,resBody);
    }
  }


}
