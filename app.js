(function () {
  var $ = function (s) {
    return document.querySelector(s);
  };
  var feed = $("#feed"),
    more = $("#more"),
    note = $("#note"),
    dlg = $("#dlg"),
    file = $("#file"),
    drop = $("#drop");
  var memes = [],
    filter = "all",
    shown = 0,
    BATCH = 6,
    picked = null,
    dbc = null,
    assets = null,
    dl = null,
    live = false;
  var reacted = {},
    hidden = {},
    sortBy = "new",
    REPORT_LIMIT = 10;

  function svgMeme(top, bottom, bg) {
    var s =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600"><rect width="600" height="600" fill="' +
      bg +
      '"/><text x="300" y="120" text-anchor="middle" font-family="Impact,Arial Black,sans-serif" font-size="54" fill="#fff" stroke="#000" stroke-width="3">' +
      top +
      '</text><text x="300" y="540" text-anchor="middle" font-family="Impact,Arial Black,sans-serif" font-size="54" fill="#fff" stroke="#000" stroke-width="3">' +
      bottom +
      '</text><text x="300" y="350" text-anchor="middle" font-size="190">\ud83d\udc38</text></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s);
  }

  var samples = [
    {
      id: "s1",
      kind: "image",
      url: svgMeme("ME: I’LL SLEEP EARLY", "IT’S 3 AM", "#5b3cff"),
      caption: "Every single night",
      ts: Date.now() - 3e6,
      laughs: 12,
      sample: true,
    },
    {
      id: "s2",
      kind: "image",
      url: svgMeme("THE WIFI GOES DOWN", "SUDDENLY I’M A PHILOSOPHER", "#e0408f"),
      caption: "Offline thoughts",
      ts: Date.now() - 9e6,
      laughs: 7,
      sample: true,
    },
    {
      id: "s3",
      kind: "image",
      url: svgMeme("ONE MORE EPISODE", "FAMOUS LAST WORDS", "#16a37a"),
      caption: "Streaming at midnight",
      ts: Date.now() - 2e7,
      laughs: 21,
      sample: true,
    },
  ];

  function ago(t) {
    var s = (Date.now() - t) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + " min ago";
    if (s < 86400) return Math.floor(s / 3600) + " h ago";
    return Math.floor(s / 86400) + " d ago";
  }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function list() {
    var base = memes.length ? memes : samples;
    return base
      .filter(function (m) {
        return (
          !hidden[m.id] &&
          !((m.reports || 0) > REPORT_LIMIT) &&
          (filter === "all" || m.kind === filter)
        );
      })
      .sort(function (a, b) {
        return sortBy === "top"
          ? (b.laughs || 0) - (a.laughs || 0) || b.ts - a.ts
          : b.ts - a.ts;
      });
  }

  function card(m) {
    var a = el("article");
    var media;
    if (m.kind === "video") {
      media = el("video", "media");
      media.src = m.url;
      media.controls = true;
      media.loop = true;
      media.muted = true;
      media.playsInline = true;
      media.preload = "metadata";
      vo.observe(media);
    } else {
      media = el("img", "media");
      media.src = m.url;
      media.alt = m.caption || "Meme";
      media.loading = "lazy";
    }
    a.appendChild(media);
    if (m.caption) a.appendChild(el("div", "cap", m.caption));
    var meta = el("div", "meta");
    meta.appendChild(
      el("span", "sp", m.sample ? "Sample meme" : "Posted anonymously, " + ago(m.ts))
    );
    var lb = el("button", "sm", "\ud83d\ude02 " + (m.laughs || 0));
    lb.setAttribute("aria-label", "Laugh");
    if (reacted[m.id]) lb.classList.add("on");
    lb.onclick = function () {
      if (reacted[m.id]) return;
      reacted[m.id] = 1;
      m.laughs = (m.laughs || 0) + 1;
      lb.textContent = "\ud83d\ude02 " + m.laughs;
      lb.classList.add("on");
      if (dbc && !m.sample) {
        dbc
          .doc(m.id)
          .update({ laughs: m.laughs })
          .catch(function () {});
      }
    };
    var db = el("button", "sm dl", "Download");
    db.onclick = function () {
      download(m, db);
    };
    var rb = el("button", "sm rep", "Report");
    rb.setAttribute("aria-label", "Report this meme");
    rb.onclick = function () {
      hidden[m.id] = 1;
      a.remove();
      m.reports = (m.reports || 0) + 1;
      if (dbc && !m.sample) {
        dbc
          .doc(m.id)
          .update({ reports: m.reports })
          .catch(function () {});
      }
      if (!feed.children.length) render(true);
    };
    meta.appendChild(rb);
    meta.appendChild(lb);
    meta.appendChild(db);
    a.appendChild(meta);
    return a;
  }

  function render(reset) {
    if (reset) {
      feed.textContent = "";
      shown = 0;
    }
    var l = list();
    if (!l.length) {
      feed.textContent = "";
      feed.appendChild(el("div", "empty", "Nothing here yet. Be the first to post."));
      return;
    }
    var empty = feed.querySelector(".empty");
    if (empty) empty.remove();
    var end = Math.min(shown + BATCH, l.length);
    for (var i = shown; i < end; i++) feed.appendChild(card(l[i]));
    shown = end;
  }

  var vo = new IntersectionObserver(
    function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.play().catch(function () {});
        } else e.target.pause();
      });
    },
    { threshold: 0.6 }
  );

  var so = new IntersectionObserver(
    function (es) {
      if (es[0].isIntersecting && shown < list().length) render(false);
    },
    { rootMargin: "400px" }
  );
  so.observe(more);

  async function download(m, btn) {
    var name =
      "mememore-" +
      m.id +
      "." +
      (m.kind === "video"
        ? m.type && m.type.indexOf("webm") > -1
          ? "webm"
          : "mp4"
        : m.type && m.type.indexOf("png") > -1
          ? "png"
          : m.type && m.type.indexOf("gif") > -1
            ? "gif"
            : m.type && m.type.indexOf("webp") > -1
              ? "webp"
              : m.url.indexOf("svg") > -1
                ? "svg"
                : "jpg");
    var old = btn.textContent;
    btn.textContent = "Saving…";
    try {
      var blob = await (await fetch(m.url)).blob();
      if (dl) {
        await dl.save({ filename: name, data: blob });
      } else {
        var u = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = u;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () {
          URL.revokeObjectURL(u);
        }, 4000);
      }
      btn.textContent = "Saved";
    } catch (e) {
      btn.textContent = e && e.code === "declined" ? old : "Try again";
    }
    setTimeout(function () {
      btn.textContent = old;
    }, 1800);
  }

  /* upload dialog */
  function setFile(f) {
    var err = $("#err");
    err.textContent = "";
    if (!f) return;
    var ok = /^(image\/(png|jpeg|gif|webp)|video\/(mp4|webm))$/.test(f.type);
    if (!ok) {
      err.textContent =
        "That file type isn’t supported. Use PNG, JPG, GIF, WebP, MP4 or WebM.";
      return;
    }
    if (f.size > 20 * 1024 * 1024) {
      err.textContent = "That file is over 20 MB. Pick a smaller one.";
      return;
    }
    picked = f;
    $("#dropTxt").textContent = f.name;
    var box = $("#prevBox");
    box.textContent = "";
    var p = el(f.type.indexOf("video") === 0 ? "video" : "img", "prev");
    p.src = URL.createObjectURL(f);
    if (p.tagName === "VIDEO") {
      p.muted = true;
      p.controls = true;
      p.playsInline = true;
    }
    box.appendChild(p);
  }

  $("#openUp").onclick = function () {
    dlg.showModal();
  };
  $("#cancel").onclick = function () {
    dlg.close();
  };
  dlg.addEventListener("close", function () {
    picked = null;
    file.value = "";
    $("#cap").value = "";
    $("#err").textContent = "";
    $("#prevBox").textContent = "";
    $("#dropTxt").textContent = "Drag a file here or tap to choose";
  });
  file.onchange = function () {
    setFile(file.files[0]);
  };
  drop.addEventListener("keydown", function (e) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      file.click();
    }
  });
  ["dragenter", "dragover"].forEach(function (t) {
    drop.addEventListener(t, function (e) {
      e.preventDefault();
      drop.classList.add("over");
    });
  });
  ["dragleave", "drop"].forEach(function (t) {
    drop.addEventListener(t, function (e) {
      e.preventDefault();
      drop.classList.remove("over");
    });
  });
  drop.addEventListener("drop", function (e) {
    setFile(e.dataTransfer.files[0]);
  });

  $("#post").onclick = async function () {
    var err = $("#err"),
      btn = $("#post");
    if (!picked) {
      err.textContent = "Choose an image or video first.";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Posting…";
    var id = "m" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    var m = {
      id: id,
      kind: picked.type.indexOf("video") === 0 ? "video" : "image",
      type: picked.type,
      caption: $("#cap").value.trim(),
      ts: Date.now(),
      laughs: 0,
    };
    try {
      if (assets && dbc) {
        var r = await assets.upload(picked);
        m.url = r.url;
        await dbc.doc(id).set({
          url: m.url,
          kind: m.kind,
          type: m.type,
          caption: m.caption,
          ts: m.ts,
          laughs: 0,
        });
      } else {
        m.url = URL.createObjectURL(picked);
        m.local = true;
        memes.unshift(m);
      }
      dlg.close();
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (!live || m.local) render(true);
    } catch (e) {
      err.textContent =
        "Upload failed. " + ((e && e.message) || "Try again in a moment.");
    }
    btn.disabled = false;
    btn.textContent = "Post meme";
  };

  document.querySelectorAll(".tab[data-f]").forEach(function (t) {
    t.onclick = function () {
      filter = t.dataset.f;
      document.querySelectorAll(".tab[data-f]").forEach(function (x) {
        x.setAttribute("aria-pressed", x === t);
      });
      render(true);
    };
  });

  document.querySelectorAll(".tab[data-s]").forEach(function (t) {
    t.onclick = function () {
      sortBy = t.dataset.s;
      document.querySelectorAll(".tab[data-s]").forEach(function (x) {
        x.setAttribute("aria-pressed", x === t);
      });
      render(true);
    };
  });

  /* shared backend, lights up when available */
  function showNote(t) {
    note.textContent = t;
    note.hidden = false;
  }

  render(true);

  (async function () {
    if (!window.claude || !claude.use) {
      showNote(
        "Preview mode: memes you post stay in this browser tab until the page is connected to shared storage."
      );
      return;
    }
    try {
      dl = await claude.use("downloads");
      assets = await claude.use("assets");
      var db = await claude.use("db");
      if (!db || !assets) {
        showNote(
          "Preview mode: memes you post stay in this browser tab. Shared posting needs a signed-in viewer."
        );
        assets = null;
        return;
      }
      dbc = db.collection("memes");
      live = true;
      var t = setTimeout(function () {}, 10000);
      dbc.onSnapshot(
        function (s) {
          clearTimeout(t);
          var local = memes.filter(function (x) {
            return x.local;
          });
          memes = s.docs
            .map(function (d) {
              var x = d.data();
              x.id = d.id;
              return x;
            })
            .concat(local);
          render(true);
        },
        function () {
          showNote("Couldn’t load the shared feed. Showing samples.");
        }
      );
    } catch (e) {
      showNote("Preview mode: memes you post stay in this browser tab.");
    }
  })();
})();
