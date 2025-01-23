// First, add D3 to your HTML
// Add this line in your HTML head section:
// <script src="https://d3js.org/d3.v7.min.js"></script>

// Wait for A-Frame to be ready
AFRAME.registerComponent('vroc-chart', {
  init: function() {
    // Load and process the CSV data
    fetch('data/DemoData3.4.24.csv')
      .then(response => response.text())
      .then(csvText => {
        const data = this.parseCSV(csvText);
        this.createChart(data);
      })
      .catch(error => console.error('Error loading CSV:', error));
  },

  parseCSV: function(csvText) {
    const lines = csvText.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1)
      .filter(line => line.trim()) // Remove empty lines
      .map(line => {
        const values = line.split(',');
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index]?.trim();
        });
        return row;
      });
  },

  createChart: function(data) {
    console.log('Starting createChart with', data.length, 'records');
    
    // Convert flat data to hierarchical structure for D3
    const stratify = d3.stratify()
      .id(d => d.PositionID)
      .parentId(d => d.ParentPositionID);

    const root = stratify(data);

    // Create D3 tree layout
    const treeLayout = d3.tree()
      .nodeSize([3, 2.5]); // [horizontal spacing, vertical spacing]

    // Calculate the layout
    const treeData = treeLayout(root);

    // Create nodes and connections using the calculated positions
    const nodeMap = new Map();

    // Create all nodes first
    treeData.descendants().forEach(node => {
      const aframeNode = document.createElement('a-entity');
      aframeNode.setAttribute('class', 'node');
      
      // D3 uses x for horizontal, y for vertical
      // We'll swap them and invert y for A-Frame's coordinate system
      aframeNode.setAttribute('position', `${node.x} ${-node.y + 6} 0`);
      
      // Create the box
      const box = document.createElement('a-box');
      box.setAttribute('width', '2');
      box.setAttribute('height', '0.8');
      box.setAttribute('depth', '0.2');
      box.setAttribute('color', '#4285F4');
      
      // Create the text label
      const text = document.createElement('a-text');
      text.setAttribute('value', `${node.data.JobTitle || 'No Title'}\n${node.data.FullName || 'No Name'}`);
      text.setAttribute('align', 'center');
      text.setAttribute('position', '0 0 0.11');
      text.setAttribute('scale', '0.8 0.8 0.8');
      text.setAttribute('color', '#FFF');
      
      aframeNode.appendChild(box);
      aframeNode.appendChild(text);
      
      nodeMap.set(node.id, {
        element: aframeNode,
        data: node
      });
      
      this.el.appendChild(aframeNode);
    });

    // Create the connections
    treeData.links().forEach(link => {
      const line = document.createElement('a-entity');
      line.setAttribute('vroc-line', {
        start: `${link.source.x} ${-link.source.y + 6} 0`,
        end: `${link.target.x} ${-link.target.y + 6} 0`,
        color: '#999'
      });
      this.el.appendChild(line);
    });
  },
  
  positionNodes: function(nodeMap) {
    console.log('Starting positionNodes with', nodeMap.size, 'nodes');
    
    // Create a child map for faster lookups
    const childrenMap = new Map();
    nodeMap.forEach((node, id) => {
      const parentId = node.data.ParentPositionID;
      if (parentId) {
        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, []);
        }
        childrenMap.get(parentId).push(node);
      }
    });
    
    // Start with root nodes (those without parents or with parent ID = 1)
    const rootNodes = Array.from(nodeMap.values())
      .filter(node => !node.data.ParentPositionID || node.data.ParentPositionID === '1');
    
    console.log('Found', rootNodes.length, 'root nodes');
    
    // Position nodes level by level
    let currentY = 6;
    let levelNodes = rootNodes;
    let levelCount = 0;
    
    while (levelNodes.length > 0) {
      console.log(`Processing level ${levelCount} with ${levelNodes.length} nodes`);
      const levelWidth = levelNodes.length * 3;
      let startX = -levelWidth / 2;
      
      // Position current level
      levelNodes.forEach((node, index) => {
        const x = startX + index * 3;
        const nodePosition = `${x} ${currentY} 0`;
        node.element.setAttribute('position', nodePosition);
        
        // Create lines to children
        const children = childrenMap.get(node.data.PositionID) || [];
        children.forEach(child => {
          const line = document.createElement('a-entity');
          const childX = child.element.getAttribute('position').x - x;
          const childY = -2.5; // Relative to parent
          
          line.setAttribute('vroc-line', {
            start: '0 0 0', // Start from parent's position
            end: `${childX} ${childY} 0`, // End at child's position relative to parent
            color: '#999'
          });
          
          // Add line as child of parent node
          node.element.appendChild(line);
        });
      });
      
      // Get next level nodes using the childrenMap
      levelNodes = levelNodes.reduce((acc, parent) => {
        const children = childrenMap.get(parent.data.PositionID) || [];
        return acc.concat(children);
      }, []);
      
      currentY -= 2.5;
      levelCount++;
      console.log(`Completed level ${levelCount}`);
    }
    
    console.log('Node positioning complete');
  }
});

AFRAME.registerComponent('vroc-line', {
  schema: {
    start: { type: 'string', default: '0 0 0' },
    end: { type: 'string', default: '0 0 0' },
    color: { type: 'color', default: '#999' }
  },

  init: function() {
    console.log('Initializing vroc-line component');
    this.drawLine();
  },

  drawLine: function() {
    const data = this.data;
    const el = this.el;
    
    // Parse the position strings
    const startParts = data.start.split(' ').map(Number);
    const endParts = data.end.split(' ').map(Number);
    
    // Create vectors from the parsed coordinates
    const start = new THREE.Vector3(startParts[0], startParts[1], startParts[2]);
    const end = new THREE.Vector3(endParts[0], endParts[1], endParts[2]);
    
    console.log('Drawing line from', start, 'to', end);
    
    // Create the line geometry
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      start.x, start.y, start.z,
      end.x, end.y, end.z
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    // Create material with better visibility
    const material = new THREE.LineBasicMaterial({ 
      color: data.color,
      linewidth: 2,
      opacity: 1,
      transparent: false
    });
    
    // Remove any existing line
    if (el.getObject3D('line')) {
      el.removeObject3D('line');
    }
    
    // Create and set the new line
    const line = new THREE.Line(geometry, material);
    el.setObject3D('line', line);
  },

  update: function(oldData) {
    this.drawLine();
  },

  remove: function() {
    this.el.removeObject3D('line');
  }
});

AFRAME.registerComponent('vroc-node', {
  init: function() {
    this.el.addEventListener('mouseenter', function() {
      this.setAttribute('scale', '1.1 1.1 1.1');
    });
    this.el.addEventListener('mouseleave', function() {
      this.setAttribute('scale', '1 1 1');
    });
  }
});

AFRAME.registerComponent('vroc-details', {
  schema: {
    title: {type: 'string'},
    details: {type: 'string'}
  },
  
  init: function() {
    this.el.addEventListener('click', () => {
      // Create or show detail panel
      console.log('Showing details for:', this.data.title);
    });
  }
});

console.log('vroc-line component registered'); 