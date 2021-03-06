var MqoParser = {};

MqoParser.load = (url, callback) => {
  new THREE.FileLoader().load(url, (text) => {
    const mqo = new Mqo().parse(text);
    if (callback)
      callback(mqo);
  });
};

class Mqo {
  constructor() {
    this.meshes    = [];
    this.materials = [];
  }

  parse(text) {
    // オブジェクトをパース
    var objectTextList = text.match(/^Object [\s\S]*?^\}/gm);

    objectTextList.forEach(objectText => {
      var mesh = new MqoMesh().parse(objectText);
      if (mesh.visible)
        this.meshes.push(mesh);
    });

    // マテリアル
    var materialText = text.match(/^Material [\s\S]*?^\}/m);
    if (materialText)
      this.materials = this._parseMaterials(materialText[0]);

    return this;
  }

  /**
  * メタセコ用マテリアル
  */
  _parseMaterials(text) {
    var infoText = text.match(/^Material [0-9]* \{\r\n([\s\S]*?)\n^\}$/m);
    var matTextList = infoText[1].split('\n');

    return matTextList.map(matText => {
      var mat = {};
      // トリムっとく
      matText = matText.trim();
      var info = matText.match(/([A-Za-z]+)\(([\w\W]+?)\)/gi);

      info.forEach(infoText => {
        var m = infoText.match(/([A-Za-z]+)\(([\w\W]+?)\)/);
        var key = m[1].toLowerCase();

        switch (key) {
          case 'tex':
          case 'aplane':
          case 'bump':
            mat[key] = m[2].replace(/"/g, '');
            break;
          default:
            mat[key] = m[2].split(' ').map(val => Number(val));
        }
      });
      return mat;
    });
  }
}

/**
* メタセコメッシュ
*/
class MqoMesh {
  constructor() {
    this.name       = '';	// 名前
    this.vertices   = [];	// 頂点
    this.faces      = [];	// 面情報
    this.vertNorms  = [];	// 頂点法線

    this.facet      = 59.5;	// スムージング角度
    this.depth      = 0;	// 階層の深さ
    this.mirror     = 0;
    this.mirrorAxis = 0;
    this.visible    = true;
  }

  parse(text) {
    // 0: 非表示, 15: 表示
    var visible = text.match(/visible (\d+)$/m);
    if (visible && visible[1] === '0') {
      this.visible = false;
      return this;
    }

    // 名前
    var name = text.match(/^Object[\s\S]+\"([^\"]+)?\"/);
    if (name)
      this.name = name[1];

    // スムージング角
    var facet = text.match(/facet ([0-9\.]+)/);
    if (facet)
      this.facet = Number(facet[1]);

    // 階層の深さ
    var depth = text.match(/depth ([0-9\.]+)/);
    if (depth)
      this.depth = Number(depth[1]);

    // ミラー
    var mirror = text.match(/mirror ([0-9])/m);
    if (mirror) {
      this.mirror = Number(mirror[1]);
      // 軸
      var mirrorAxis = text.match(/mirror_axis ([0-9])/m);
      if (mirrorAxis)
        this.mirrorAxis = Number(mirrorAxis[1]);
    }

    var vertex_txt = text.match(/vertex ([0-9]+).+\{\s([\w\W]+)}$/gm);
    this._parseVertices(RegExp.$1, RegExp.$2);

    var face_txt = text.match(/face ([0-9]+).+\{\s([\w\W]+)}$/gm);
    this._parseFaces(RegExp.$1, RegExp.$2);

    return this;
  }

  _parseVertices(num, text) {
    var vertexTextList = text.split('\n');
    for (var i = 1; i <= num; ++i) {
      var vertex = vertexTextList[i].split(' ').map(val => Number(val));
      this.vertices.push(vertex);
    }

    if (this.mirror) {
      const x = 0b001;
      const y = 0b010;
      const z = 0b100;

      if (x & this.mirrorAxis)
        this.vertices.forEach(v => this.vertices.push([v[0] * -1, v[1], v[2]]));

      if (y & this.mirrorAxis)
        this.vertices.forEach(v => this.vertices.push([v[0], v[1] * -1, v[2]]));

      if (z & this.mirrorAxis)
        this.vertices.forEach(v => this.vertices.push([v[0], v[1], v[2] * -1]));
    }
  }

  _parseFaces(num, text) {
    var faceTextList = text.split('\n');

    for (var i = 1; i <= num; ++i) {
      // トリムっとく
      var faceText = faceTextList[i].trim();
      // 面の数
      var vNum = Number(faceText.match(/^([0-9]+) V/)[1]);

      var face = {
        m  : [],			// マテリアル デフォルト値
        uv : [0, 0, 0, 0, 0, 0, 0, 0],	// UV デフォルト値
        vNum
      };

      var info = faceText.match(/([A-Za-z]+)\(([\w\s\-\.\(\)]+?)\)/gi);
      info.forEach(infoText => {
        var m = infoText.match(/([A-Za-z]+)\(([\w\s\-\.\(\)]+?)\)/);
        var key = m[1].toLowerCase();
        face[key] = m[2].split(' ').map(val => Number(val));
      });

      this.faces.push(face);
    }

    // ミラー対応
    if (this.mirror) {
      const x = 0b001;
      const y = 0b010;
      const z = 0b100;

      let n = 0;
      if (x & this.mirrorAxis) n++;
      if (y & this.mirrorAxis) n++;
      if (z & this.mirrorAxis) n++;

      for (; 0 < n; n--) {
        const vertexOffset = (this.vertices.length / (1 << n));
        this.faces.forEach(targetFace => {
          var face = {
            m    : targetFace.m,
            uv   : targetFace.uv.reduceRight((acc, cur, i, arr) => (i % 2) ? acc : [...acc, cur, arr[i + 1]], []),
            v    : targetFace.v.map(v => v + vertexOffset).reverse(),
            vNum : targetFace.vNum
          };

          this.faces.push(face);
        });
      }
    }
  }
}

if (typeof exports !== 'undefined') {
  if (typeof module !== 'undefined' && module.exports) {
    exports = module.exports = MqoParser;
  }
  exports.MqoParser = MqoParser;
} else {
  this['MqoParser'] = MqoParser;
}
