function save_graph(json_graph){
    var form = document.createElement("form");
    form.setAttribute("method", "post");
    form.setAttribute("action", "/save_json_file");
    form.setAttribute("target", "_blank");
    var hiddenField = document.createElement("input");
    hiddenField.setAttribute("name", "json_file");
    hiddenField.setAttribute("value", JSON.stringify(json_graph) );
    hiddenField.setAttribute("type", "hidden");
    form.appendChild(hiddenField);
    document.body.appendChild(form);
    form.submit();
}


function add_sybils(json_graph, sybils){
    var box = Ext.MessageBox.wait('Please wait ...');
    Ext.Ajax.request({
        url:'/add_sybils',
        method: 'POST',
        params: {'json_graph':JSON.stringify(json_graph), 'sybils':sybils},
        success: function(data, action) {
            var res = JSON.parse(data.responseText);
            load_graph(res['graph'], res['graph_info']);
            box.hide();
        },
        failure: function(form, action) {
            Ext.Msg.alert('Failed', 'Failed');
        }
    });
}


function load_default_graph() {
    var box = Ext.MessageBox.wait('Please wait ...');
    Ext.Ajax.request({
        url:'/load_default',
        method: 'POST',
        success: function(data) {
            var res = JSON.parse(data.responseText);
            load_graph(res['graph'], res['graph_info']);
            box.hide();
        }
    });
}


var node_info_panel={
    region: 'center',
    xtype: 'panel',
    title: 'Node Info',
    flex: 1,
    id: 'node_info_panel',
    html: '<div id="node_info" style="margin: 10px;"></div>'
}


var graph_info_panel={
    xtype: 'panel',
    title: 'Graph Info',
    id: 'graph_info_panel',
    html: '<div id="graph_info" style="margin: 10px;"></div>'
}


var sybils_panel = {
    xtype: 'form',
    id: 'sybils_panel',
    title: 'Add Sybil',
    autoScroll: true,
    bodyPadding: 10,
    items: [{
        xtype: 'textarea',
        name: 'sybils',
        id: 'sybils_textarea',
        grow: true,
        anchor: '100%'
    },{
        xtype: 'hidden',
        name: 'graph_json',
        id: 'graph_json'
    }],
    buttons: [
    {
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
                add_sybils(server_graph, form.getValues()['sybils']);
            }
        }
    }]
}


var graph_load_panel={
    xtype: 'form',
    title: 'Load Graph',
    id: 'graph_load_panel',
    bodyPadding: 10,
    items: [{
        xtype: 'filefield',
        name: 'graph_json_file',
        id: 'graph_json_file',
        anchor: '100%'
    }],
    buttons: [
    {
        text: 'Reset',
        handler: function() {
            this.up('form').getForm().reset();
        }
    }, {
        xtype: 'tbfill'
    }, {
        text: 'Load',
        handler: function() {
            var form = this.up('form').getForm();
            if (form.isValid()) {
                form.submit({
                    url: '/upload_graph_json',
                    waitMsg : 'Please Wait...',
                    success: function(data, action) {
                        var res = JSON.parse(action.response.responseText);
                        load_graph(res['graph'], res['graph_info']);
                    },
                    failure: function(form, action) {
                        Ext.Msg.alert('Failed', action.result.msg);
                    }
                });
            }
        }
    }]
}


var new_graph_panel = {
    xtype: 'form',
    id: 'new_graph_panel',
    title: 'Create New Graph',
    autoScroll: true,
    bodyPadding: 10,
    defualt: {
        anchor: '100%'
    },
    items: [{
        xtype: 'numberfield',
        name: 'num_groups',
        minValue: 1,
        fieldLabel: 'Num Groups',
        value: 5
    }, {
        xtype: 'numberfield',
        name: 'num_seed_groups',
        minValue: 1,
        fieldLabel: 'Num Seed Groups',
        value: 2
    },{
        xtype: 'numberfield',
        name: 'min_group_nodes',
        minValue: 1,
        fieldLabel: 'Min Group Nodes',
        value: 20
    },{
        xtype: 'numberfield',
        name: 'max_group_nodes',
        minValue: 1,
        fieldLabel: 'Max Group Nodes',
        value: 50
    },{
        xtype: 'numberfield',
        name: 'max_known_ratio',
        minValue: 0,
        maxValue: 1,
        fieldLabel: 'Max Known Ratio',
        value: 1
    },{
        xtype: 'numberfield',
        name: 'avg_known_ratio',
        minValue: 0,
        maxValue: 1,
        fieldLabel: 'Avg Known Ratio',
        value: .5
    },{
        xtype: 'numberfield',
        name: 'min_known_ratio',
        minValue: 0,
        maxValue: 1,
        fieldLabel: 'Min Known Ratio',
        value: .2
    },{
        xtype: 'numberfield',
        name: 'num_seed_nodes',
        minValue: 1,
        fieldLabel: 'Num Seed Nodes',
        value: 20
    },{
        xtype: 'numberfield',
        name: 'num_attacker_to_num_honest',
        minValue: 0,
        fieldLabel: 'Num Attacker To Num Honest',
        value: .1
    },{
        xtype: 'numberfield',
        name: 'num_sybil_to_num_attacker',
        minValue: 0,
        fieldLabel: 'Num Sybil To Num Attacker',
        value: 5
    },{
        xtype: 'numberfield',
        name: 'sybil_to_attackers_con',
        minValue: 0,
        maxValue: 1,
        fieldLabel: 'Sybil To Attackers Con',
        value: .2
    },{
        xtype: 'numberfield',
        name: 'num_joint_node',
        minValue: 0,
        fieldLabel: 'Num Joint Node',
        value: 20
    },{
        xtype: 'numberfield',
        name: 'num_inter_group_con',
        minValue: 0,
        fieldLabel: 'Num Inter Group Con',
        value: 20
    }],
    buttons: [
    {
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
                    url: '/new_graph',
                    waitMsg : 'Please Wait...',
                    success: function(data, action) {
                        var res = JSON.parse(action.response.responseText);
                        load_graph(res['graph'], res['graph_info']);
                    },
                    failure: function(form, action) {
                        Ext.Msg.alert('Failed', action.result.msg);
                    }
                });
            }
        }
    }]
}


var utils_panel = {
    region: 'south',
    xtype: 'panel',
    flex: 3,
    id: 'utils_panel',
    layout: 'accordion',
    items: [
        graph_info_panel,
        sybils_panel,
        graph_load_panel,
        new_graph_panel
    ]
}

Ext.Loader.setConfig({enabled: true});
Ext.Loader.setPath('Ext.ux', 'ext/examples/ux');
Ext.require([
    'Ext.data.*',
    'Ext.util.*',
    'Ext.Action',
    'Ext.tab.*',
    'Ext.button.*',
    'Ext.form.*',
    'Ext.layout.container.Border',
    'Ext.fx.target.Sprite',
    'Ext.layout.container.Fit',
    'Ext.window.MessageBox'
]);
Ext.onReady(function(){
    var app = Ext.create('Ext.container.Viewport', {
        layout: {
            type: 'border',
            padding: 5,
        },
        defaults: {
            split: true,
        },
        items: [{
            xtype: 'panel',
            title: 'Graph',
            region: 'center',
            id: 'display_panel',
            html: '<div id="graph_div" style="width: 100%; height: 100%"></div>',
            buttons: [{
                text: 'Save',
                handler: function() {
                    save_graph(server_graph);
                },
            }]
        }, {
            xtype: 'panel',
            region: 'west',
            id: 'details_panel',
            layout: 'border',
            width: 300,
            defaults: {
                split: true,
            },
            items: [utils_panel, node_info_panel]
        }]
    });
    load_default_graph();
});
