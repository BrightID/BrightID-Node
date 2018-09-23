var centerPanle={
    xtype: 'panel',
    title: 'Graph',
    region: 'center',
    id: 'center_panel',
    html: '<div id="graph_div" style="width: 100%; height: 100%"></div>'
}

var node_panel={
    xtype: 'panel',
    region: 'north',
    flex: 1,
    title: 'Node Info',
    id: 'node_panel',
    html: '<div id="info" style="margin: 10px; position: fixed;"></div>'
}

var sybils_panel = {
    xtype: 'form',
    flex: 2,
    id: 'sybils_panel',
    title: 'Sybils',
    region: 'center',
    autoScroll: true,
    bodyPadding: 10,
    items: [{
        xtype: 'textarea',
        name: 'sybils',
        id: 'sybils_textarea',
        grow: true,
        anchor: '100%'
    }],
    buttons: [{
        text: 'Reset',
        handler: function() {
            this.up('form').getForm().reset();
        }
    }, {
        xtype: 'tbfill'
    }, {
        text: 'Submit',
        handler: function() {
            var form = this.up('form').getForm();
            if (form.isValid()) {
                form.submit({
                    url: '/set_sybils',
                    waitMsg : 'Please Wait...',
                    success: function(data, action) {
                        var graph= JSON.parse(action.response.responseText)['graph'];
                        load_graph(graph);
                    },
                    failure: function(form, action) {
                        Ext.Msg.alert('Failed', action.result.msg);
                    }
                });
            }
        }
    }]
}