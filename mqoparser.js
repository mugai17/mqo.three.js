var MqoParser = {};

MqoParser.load = (url, callback) => {
  new THREE.FileLoader().load(url, (text) => {
    var mqo = MqoParser.parse(text);
    if (callback)
      callback(mqo);
  });
};

MqoParser.parse = (text) => {
  var mqo = new Mqo();
  mqo.parse(text);
  return mqo;
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

    var materials = matTextList.map(matText => {
      var mat = {};
      // トリムっとく
      matText = matText.replace(/^\s+|\s+$/g, '');
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

    return materials;
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
      var toMirror = {
        1: (v) => [v[0] * -1, v[1], v[2]],
        2: (v) => [v[0], v[1] * -1, v[2]],
        4: (v) => [v[0], v[1], v[2] * -1]
      }[this.mirrorAxis];

      this.vertices.forEach(vertex => {
        this.vertices.push(toMirror(vertex));
      });
    }
  }

  _parseFaces(num, text) {
    var faceTextList = text.split('\n');

    var calcNormalize = (a, b, c) => {
      var v1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      var v2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      var v3 = [
        v1[1] * v2[2] - v1[2] * v2[1],
        v1[2] * v2[0] - v1[0] * v2[2],
        v1[0] * v2[1] - v1[1] * v2[0]
      ];
      var len = Math.sqrt(v3[0] * v3[0] + v3[1] * v3[1] + v3[2] * v3[2]);

      if (len === 0)
        return [0, 0, 0];

      v3[0] /= len;
      v3[1] /= len;
      v3[2] /= len;

      return v3;
    };

    for (var i = 1; i <= num; ++i) {
      // トリムっとく
      var faceText = faceTextList[i].replace(/^\s+|\s+$/g, '');
      // 面の数
      var vertex_num = Number(faceText[0]);

      var info = faceText.match(/([A-Za-z]+)\(([\w\s\-\.\(\)]+?)\)/gi);
      var face = {
        m    : [undefined],			// マテリアル デフォルト値
        uv   : [0, 0, 0, 0, 0, 0, 0, 0],	// UV デフォルト値
        vNum : vertex_num
      };

      info.forEach(infoText => {
        var m = infoText.match(/([A-Za-z]+)\(([\w\s\-\.\(\)]+?)\)/);
        var key = m[1].toLowerCase();
        face[key] = m[2].split(' ').map(val => Number(val));
      });

      // 法線計算
      if (face.v.length === 3) {
        face.n = calcNormalize(this.vertices[face.v[0]], this.vertices[face.v[1]], this.vertices[face.v[2]]);
      } else if (face.v.length === 4) {
        var n1 = calcNormalize(this.vertices[face.v[0]], this.vertices[face.v[1]], this.vertices[face.v[2]]);
        var n2 = calcNormalize(this.vertices[face.v[2]], this.vertices[face.v[3]], this.vertices[face.v[0]]);
        face.n = [
          (n1[0] + n2[0]) * 0.5,
          (n1[1] + n2[1]) * 0.5,
          (n1[2] + n2[2]) * 0.5
        ];
      } else {
        face.n = [0, 0, 0];
      }

      this.faces.push(face);
    }

    // ミラー対応
    if (this.mirror) {
      var swap = function (a, b) { var temp = this[a]; this[a] = this[b]; this[b] = temp; return this; };
      var vertexOffset = (this.vertices.length / 2);
      this.faces.forEach(targetFace => {
        var face = {
          m    : targetFace.m,
          n    : targetFace.n,
          uv   : [...targetFace.uv],
          v    : targetFace.v.map(val => val + vertexOffset),
          vNum : targetFace.vNum
        };

        if (face.vNum === 3) {
          swap.call(face.v,  1, 2);
          swap.call(face.uv, 2, 4);
          swap.call(face.uv, 3, 5);
        } else if (face.vNum === 4) {
          swap.call(face.v,  0, 1);
          swap.call(face.uv, 0, 2);
          swap.call(face.uv, 1, 3);

          swap.call(face.v,  2, 3);
          swap.call(face.uv, 4, 6);
          swap.call(face.uv, 5, 7);
        }

        this.faces.push(face);
      });
    }

    // 頂点法線を求める
    var vertNorm = this.vertices.map(() => []);

    this.faces.forEach(face => {
      var vIndices = face.v;

      for (var j = 0; j < face.vNum; ++j) {
        var index = vIndices[j];
        vertNorm[index].push(face.n);
      }
    });

    this.vertNorms = vertNorm.map(vn => {
      var result = [0, 0, 0];
      var len = vn.length;
      for (var j = 0; j < len; ++j) {
        result[0] += vn[j][0];
        result[1] += vn[j][1];
        result[2] += vn[j][2];
      }

      result[0] /= len;
      result[1] /= len;
      result[2] /= len;

      var len = Math.sqrt(result[0] * result[0] + result[1] * result[1] + result[2] * result[2]);
      result[0] /= len;
      result[1] /= len;
      result[2] /= len;

      return result;
    });
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
