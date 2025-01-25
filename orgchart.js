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
    const stratify = d3.stratify()
      .id(d => d.PositionID)
      .parentId(d => d.ParentPositionID);

    const root = stratify(data);

    const treeLayout = d3.tree()
      .nodeSize([1.5, 1.25]);

    const treeData = treeLayout(root);

    // Track min and max x coordinates and lowest y position
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;  // Add this

    // First pass to find width and lowest point
    treeData.descendants().forEach(node => {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      const nodeY = -node.y + 6;
      minY = Math.min(minY, nodeY - 0.2);
    });

    // Add logging for boxes at or near the lowest point
    const lowestBoxes = treeData.descendants()
      .filter(node => {
        const nodeY = -node.y + 6;
        return Math.abs(nodeY - minY - 0.2) < 0.01; // Within 0.01 units of lowest point
      })
      .map(node => ({
        title: node.data.JobTitle,
        y: -node.y + 6
      }));

    console.log('Lowest boxes:', lowestBoxes);

    const treeWidth = maxX - minX;
    const circumference = (treeWidth * 1.33333) / 2;
    const radius = circumference / (2 * Math.PI);

    // Calculate required y-offset to lift everything just above ground
    const yOffset = 0.1 - minY; // 0.1 units above ground

    console.log('X-coordinate bounds:', {
      min: minX,
      max: maxX,
      width: treeWidth,
      radius: radius,
      lowestPoint: minY,
      yOffset: yOffset
    });

    const nodeMap = new Map();
    const collapsedNodes = new Set();

    // Create nodes with circular positioning
    treeData.descendants().forEach(node => {
      const aframeNode = document.createElement('a-entity');
      aframeNode.setAttribute('class', 'node');
      aframeNode.setAttribute('data-department', node.data.Department || 'No Department');
      aframeNode.setAttribute('data-location', node.data.WorkLocation || 'No Location');
      aframeNode.setAttribute('data-positionid', node.data.PositionID);
      
      // Calculate position on half-circle
      // Map x from [-width/2, width/2] to [π/2, 3π/2] to center root at π
      const angle = ((node.x - minX) / treeWidth) * Math.PI - Math.PI/2;
      
      // Calculate position on half-circle
      const x = radius * Math.sin(angle);
      const z = -radius * Math.cos(angle);
      const y = (-node.y + 6) + yOffset; // Add yOffset here
      
      aframeNode.setAttribute('position', `${x} ${y} ${z}`);
      
      // Calculate rotation to face origin
      const rotationY = Math.atan2(x, z) * (180 / Math.PI) + 180;
      aframeNode.setAttribute('rotation', `0 ${rotationY} 0`);
      
      // Create the box with darker color
      const box = document.createElement('a-box');
      box.setAttribute('width', '0.3');
      box.setAttribute('height', '0.4');
      box.setAttribute('depth', '0.1');
      box.setAttribute('color', '#1a237e'); // Changed to a darker blue
      
      // Create two separate text elements for title and name
      const titleText = document.createElement('a-text');
      const titleValue = node.data.JobTitle || 'No Title';
      titleText.setAttribute('value', titleValue);
      titleText.setAttribute('align', 'center');
      titleText.setAttribute('scale', '1.5 1.5 1.5');
      titleText.setAttribute('color', '#cccccc');
      titleText.setAttribute('width', '0.2');
      titleText.setAttribute('wrap-count', '8');
      titleText.setAttribute('whiteSpace', 'pre');

      // Calculate approximate number of lines for title
      const titleLines = Math.ceil((titleValue.length * 0.2) / 8);
      const titleHeight = titleLines * 0.03; // Reduced from 0.05 to 0.03

      const nameText = document.createElement('a-text');
      const nameValue = node.data.FullName || 'No Name';
      nameText.setAttribute('value', nameValue);
      nameText.setAttribute('align', 'center');
      nameText.setAttribute('scale', '1.5 1.5 1.5');
      nameText.setAttribute('color', '#FFFFFF');
      nameText.setAttribute('width', '0.2');
      nameText.setAttribute('wrap-count', '8');
      nameText.setAttribute('whiteSpace', 'pre');

      // Calculate approximate number of lines for name
      const nameLines = Math.ceil((nameValue.length * 0.2) / 8);
      const nameHeight = nameLines * 0.03; // Reduced from 0.05 to 0.03

      // Position texts with calculated offsets
      const spacing = 0.05; // Increased from 0.02 to 0.05
      const totalHeight = titleHeight + nameHeight + spacing;
      const titleY = 0.1; // Fixed position for title
      const nameY = -0.1; // Fixed position for name

      titleText.setAttribute('position', `0 ${titleY} 0.06`);
      titleText.setAttribute('baseline', 'center');

      nameText.setAttribute('position', `0 ${nameY} 0.06`);
      nameText.setAttribute('baseline', 'center');

      aframeNode.appendChild(box);
      aframeNode.appendChild(titleText);
      aframeNode.appendChild(nameText);
      
      nodeMap.set(node.id, {
        element: aframeNode,
        data: node,
        position: {x, y, z},
        angle: angle,
        lines: []  // Array to store connecting line segments
      });
      
      this.el.appendChild(aframeNode);

      // Add event listeners for raycaster intersection
      aframeNode.addEventListener('raycaster-intersected', function() {
        const hudContainer = document.querySelector('#hud-container');
        const hud = document.querySelector('#hud');
        const hudFace = document.querySelector('#hud-face');
        const dept = this.getAttribute('data-department');
        const loc = this.getAttribute('data-location');
        const positionId = this.getAttribute('data-positionid');
        
        // Set the face image
        hudFace.setAttribute('src', `data/faces/${positionId}.jpg`);
        
        // Set the text
        hud.setAttribute('text', {
          value: `Department: ${dept}\nLocation: ${loc}`,
          width: 0.9,
          color: 'white',
          align: 'center',
          baseline: 'center'
        });
        hudContainer.setAttribute('visible', true);
      });

      aframeNode.addEventListener('raycaster-intersected-cleared', function() {
        const hudContainer = document.querySelector('#hud-container');
        hudContainer.setAttribute('visible', false);
      });

      // Add click handler for collapse/expand
      aframeNode.addEventListener('click', function() {
        const nodeId = node.id;
        if (collapsedNodes.has(nodeId)) {
          // Expand
          collapsedNodes.delete(nodeId);
          const descendants = node.descendants().slice(1);
          descendants.forEach(descendant => {
            const descendantEl = nodeMap.get(descendant.id);
            descendantEl.element.setAttribute('visible', true);
            
            if (descendant.parent) {
              const parentData = nodeMap.get(descendant.parent.id);
              parentData.lines.forEach(lineGroup => {
                if (lineGroup.targetId === descendant.id) {
                  lineGroup.segments.forEach(segment => {
                    segment.setAttribute('visible', true);
                  });
                }
              });
            }
          });
        } else {
          // Collapse
          collapsedNodes.add(nodeId);
          const descendants = node.descendants().slice(1);
          descendants.forEach(descendant => {
            const descendantEl = nodeMap.get(descendant.id);
            descendantEl.element.setAttribute('visible', false);
            
            if (descendant.parent) {
              const parentData = nodeMap.get(descendant.parent.id);
              parentData.lines.forEach(lineGroup => {
                if (lineGroup.targetId === descendant.id) {
                  lineGroup.segments.forEach(segment => {
                    segment.setAttribute('visible', false);
                  });
                }
              });
            }
          });
        }
      });

      // Add hover effect to indicate clickability
      aframeNode.addEventListener('mouseenter', function() {
        box.setAttribute('color', '#2a337e'); // Slightly lighter blue on hover
      });
      
      aframeNode.addEventListener('mouseleave', function() {
        box.setAttribute('color', '#1a237e'); // Back to original color
      });
    });

    // Create the connections with curved lines
    treeData.links().forEach(link => {
      const source = nodeMap.get(link.source.id);
      const target = nodeMap.get(link.target.id);
      
      // Create multiple segments to follow the arc
      const segments = 16;
      const startAngle = source.angle;
      const endAngle = target.angle;
      
      // Ensure we're taking the shorter path around the arc
      let angleDiff = endAngle - startAngle;
      if (Math.abs(angleDiff) > Math.PI) {
        if (angleDiff > 0) {
          angleDiff = angleDiff - 2 * Math.PI;
        } else {
          angleDiff = angleDiff + 2 * Math.PI;
        }
      }
      
      const lineSegments = []; // Store all segments for this connection
      
      // Create points along the arc
      for (let i = 0; i < segments - 1; i++) {
        const t = i / (segments - 1);
        const currentAngle = startAngle + angleDiff * t;
        const nextAngle = startAngle + angleDiff * ((i + 1) / (segments - 1));
        
        // Calculate positions on the circle at the current height
        const y = source.position.y + (target.position.y - source.position.y) * t;
        const nextY = source.position.y + (target.position.y - source.position.y) * ((i + 1) / (segments - 1));
        
        // Calculate current and next positions on circle
        const x1 = radius * Math.sin(currentAngle);
        const z1 = -radius * Math.cos(currentAngle);
        const x2 = radius * Math.sin(nextAngle);
        const z2 = -radius * Math.cos(nextAngle);
        
        // Create line segment
        const line = document.createElement('a-entity');
        line.setAttribute('vroc-line', {
          start: `${x1} ${y} ${z1}`,
          end: `${x2} ${nextY} ${z2}`,
          color: '#999'
        });
        line.setAttribute('class', `line-${source.data.id}-${target.data.id}`); // Add class for debugging
        this.el.appendChild(line);
        lineSegments.push(line);
      }
      
      
      // Store the line segments with the source node
      source.lines.push({
        targetId: target.data.id,
        segments: lineSegments
      });
    });
  },
  
  positionNodes: function(nodeMap) {
    
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
    
    
    // Position nodes level by level
    let currentY = 6;
    let levelNodes = rootNodes;
    let levelCount = 0;
    
    while (levelNodes.length > 0) {
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
    }
    
  }
});

AFRAME.registerComponent('vroc-line', {
  schema: {
    start: { type: 'string', default: '0 0 0' },
    end: { type: 'string', default: '0 0 0' },
    color: { type: 'color', default: '#999' }
  },

  init: function() {
    this.drawLine();
  },

  drawLine: function() {
    const data = this.data;
    const el = this.el;
    
    const startParts = data.start.split(' ').map(Number);
    const endParts = data.end.split(' ').map(Number);
    
    const start = new THREE.Vector3(startParts[0], startParts[1], startParts[2]);
    const end = new THREE.Vector3(endParts[0], endParts[1], endParts[2]);
    
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array([
      start.x, start.y, start.z,
      end.x, end.y, end.z
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    
    const material = new THREE.LineBasicMaterial({ 
      color: data.color,
      linewidth: 2,
      opacity: 1,
      transparent: false
    });
    
    if (el.getObject3D('line')) {
      el.removeObject3D('line');
    }
    
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
    });
  }
});

