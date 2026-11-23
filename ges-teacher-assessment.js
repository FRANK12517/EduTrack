(function (window, document) {
  'use strict';
  if (window.GESTeacherAssessment) return;
  var categories = [
    {key:'conduct',label:'Conduct',id:'slip-conduct',field:'conduct'},
    {key:'interest',label:'Interest',id:'slip-interest',field:'interest'},
    {key:'attitude',label:'Attitude',id:'slip-attitude',field:'attitude'},
    {key:'ctRemarks',label:"Class Teacher's Remarks",id:'slip-ct-remarks',field:'ctRemarks'},
    {key:'htRemarks',label:"Headteacher's Remarks",id:'slip-ht-remarks',field:'htRemarks'}
  ];
  var additions = {
    conduct:{positive:[
      'Shows consistent respect for classmates and staff.','Takes responsibility for personal choices.','Cooperates courteously during shared tasks.','Demonstrates honesty in daily school life.','Follows classroom routines with care.','Uses school resources responsibly.','Settles disagreements in a respectful manner.','Supports a calm and orderly classroom.','Shows dependable conduct during activities.','Treats school property with consideration.','Listens attentively to instructions.','Contributes positively to peer relationships.','Acts with integrity when working independently.','Shows growing self-discipline throughout the term.','Encourages others to follow school rules.'
    ],negative:[
      'Needs reminders to follow classroom routines.','Should show greater respect during discussions.','Needs to take responsibility for daily choices.','Should cooperate more consistently with peers.','Needs support to use school property carefully.','Sometimes interrupts learning activities.','Should listen fully before responding to instructions.','Needs to resolve disagreements more calmly.','Would benefit from practising honesty consistently.','Needs to observe school rules more reliably.','Should reduce behaviours that distract classmates.','Needs guidance to complete assigned duties responsibly.','Should demonstrate greater respect for shared spaces.','Needs to pause and consider the impact of actions.','Would benefit from consistent support with self-discipline.'
    ]},
    interest:{positive:[
      'Asks thoughtful questions about new topics.','Shows curiosity during practical lessons.','Participates eagerly in classroom activities.','Takes initiative to explore unfamiliar ideas.','Engages actively in group learning.','Shows enthusiasm when learning new skills.','Volunteers useful ideas during discussions.','Approaches learning tasks with curiosity.','Enjoys connecting lessons to everyday life.','Contributes willingly to classroom projects.','Shows interest across a range of subjects.','Seeks opportunities to learn beyond assigned work.','Participates constructively in demonstrations.','Shows initiative in finding learning resources.','Maintains keen engagement during lessons.'
    ],negative:[
      'Needs encouragement to participate in lessons.','Should show more curiosity about new topics.','Often waits for prompting before beginning tasks.','Would benefit from taking initiative in learning.','Needs to engage more actively in group work.','Shows limited participation during discussions.','Should ask questions when ideas are unclear.','Needs support to remain engaged in practical work.','Would benefit from exploring topics more fully.','Needs encouragement to contribute ideas.','Should take a more active role in projects.','Shows inconsistent engagement across subjects.','Needs to connect classroom learning with examples.','Should make fuller use of learning opportunities.','Would benefit from sustained attention to activities.'
    ]},
    attitude:{positive:[
      'Approaches challenges with perseverance.','Responds constructively to feedback.','Shows confidence when attempting new tasks.','Maintains a positive approach to learning.','Demonstrates commitment to steady improvement.','Keeps trying when work is demanding.','Accepts guidance with maturity.','Shows resilience after making mistakes.','Takes pride in thoughtful effort.','Sets a commendable example of persistence.','Approaches correction as an opportunity to learn.','Shows growing confidence in personal abilities.','Works patiently toward learning goals.','Demonstrates a dependable commitment to study.','Maintains a willing and positive mindset.'
    ],negative:[
      'Needs to persist when tasks become challenging.','Should respond more openly to helpful feedback.','Would benefit from greater confidence when answering.','Needs a more consistent approach to learning.','Should show stronger commitment to regular practice.','Sometimes stops before completing challenging work.','Needs support to accept correction constructively.','Should make a renewed effort after mistakes.','Needs to take greater pride in careful effort.','Would benefit from setting achievable learning goals.','Should use guidance to improve future work.','Needs encouragement to trust personal abilities.','Should practise patience when solving problems.','Needs greater consistency in completing study tasks.','Would benefit from a more willing learning mindset.'
    ]},
    ctRemarks:{positive:[
      'Has made steady progress in academic and personal development.','Shows clear growth and should continue this good effort.','Builds on strengths with increasing independence.','Has achieved commendable progress this term.','Approaches classwork with care and commitment.','Shows improvement in applying learned skills.','Contributes positively to the learning environment.','Has developed stronger and more consistent study habits.','Demonstrates encouraging progress across learning areas.','Uses feedback to strengthen the quality of work.','Shows promise through consistent participation.','Has worked conscientiously toward learning goals.','Displays a good balance of effort and cooperation.','Continued practice will help these strengths flourish.','Is encouraged to maintain this positive progress.'
    ],negative:[
      'Should practise key skills regularly to strengthen progress.','More consistent effort would improve classwork outcomes.','Needs to complete learning tasks with greater care.','Would benefit from a regular revision routine.','Should seek help promptly when concepts are unclear.','Needs continued support to meet learning goals.','Greater attention to instructions will improve accuracy.','Should allow more time for checking completed work.','Needs to participate more consistently in class activities.','Regular reading practice is recommended for progress.','Would benefit from breaking larger tasks into steps.','Should apply feedback consistently to future assignments.','More practice is needed to build confidence in core skills.','Needs a steady routine for homework completion.','Close encouragement will support further improvement.'
    ]},
    htRemarks:{positive:[
      'Has contributed positively to school life this term.','Shows encouraging academic and personal development.','Is commended for steady progress and good character.','Continued commitment will support further achievement.','Demonstrates a responsible approach to school activities.','Has shown growth in learning and self-management.','Sets a positive example through thoughtful participation.','Is encouraged to build on this sound progress.','Shows promise in both academic work and conduct.','Contributes to a respectful school community.','Has approached the term with commendable dedication.','Displays growing maturity and responsibility.','Continued effort will open further opportunities.','Is recognised for consistent improvement this term.','May continue to achieve through purposeful effort.'
    ],negative:[
      'Should strengthen commitment to school responsibilities.','More consistent effort is needed across learning areas.','Needs to improve punctuality and readiness for lessons.','Would benefit from closer attention to school routines.','Should demonstrate greater responsibility in daily tasks.','Needs to act on guidance to improve performance.','Regular attendance and participation require attention.','Should show increased care for school expectations.','A consistent study routine is recommended.','Needs to improve cooperation in school activities.','Greater commitment will support better progress.','Should seek assistance early when facing difficulties.','Needs to demonstrate respectful conduct at all times.','Improvement depends on steady effort and follow-through.','Home and school encouragement can support progress.'
    ]}
  };
  function originalApi(){try{return EMS_COMMENT_LIBRARY_API;}catch(_){return window.EMS_COMMENT_LIBRARY_API||null;}}
  function normalize(value){return String(value||'').trim().toLocaleLowerCase();}
  var all = {};
  Object.keys(additions).forEach(function(cat){
    all[cat]={positive:[],negative:[]};
    ['positive','negative'].forEach(function(sent){
      var seen=new Set();
      additions[cat][sent].forEach(function(text){var key=normalize(text);if(key&&!seen.has(key)){seen.add(key);all[cat][sent].push(text);}});
    });
  });
  function refreshLibrary(){var api=originalApi();if(!api||typeof api.getComments!=='function')return;Object.keys(additions).forEach(function(cat){['positive','negative'].forEach(function(sent){var seen=new Set();all[cat][sent]=api.getComments(cat,sent).concat(additions[cat][sent]).filter(function(text){var key=normalize(text);if(!key||seen.has(key))return false;seen.add(key);return true;});});});}
  function contextFor(kind, host){
    if(kind==='mock'){
      var container=document.getElementById('gmr-slip-container');
      return ['mock',container&&container.dataset.class||'',container&&container.dataset.mockType||'',container&&container.dataset.student||'',document.getElementById('gmr-year')?.value||'',document.getElementById('gmr-term')?.value||''].join('|');
    }
    // The exam UI has no separate class/year/term controls. Include the
    // rendered student/result metadata so a changed class or academic
    // context cannot reuse another result's assessment state.
    var resultContext=host&&host.querySelector('.slip-info-grid')?.textContent||'';
    return ['exam',document.getElementById('slip-index')?.value||'',resultContext,document.getElementById('slip-class')?.value||'',document.getElementById('slip-year')?.value||'',document.getElementById('slip-term')?.value||''].join('|');
  }
  function readState(key){try{return JSON.parse(localStorage.getItem('ges_assessment_v1:'+key)||'{}')}catch(_){return {}}}
  function writeState(key,value){try{localStorage.setItem('ges_assessment_v1:'+key,JSON.stringify(value))}catch(_){}}
  function setSelectValue(select,value){
    if(!select)return;
    value=String(value||'');
    if(value&&select.tagName==='SELECT'&&!Array.prototype.some.call(select.options,function(option){return option.value===value;})){
      var option=document.createElement('option');option.value=value;option.textContent=value;select.appendChild(option);
    }
    select.value=value;
  }
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function mount(kind,host){
    if(!host||!host.querySelector('.result-slip'))return;
    refreshLibrary();
    var slip=host.querySelector('.result-slip'), key=contextFor(kind,host), state=readState(key);
    var panelId='ges-assessment-panel-'+kind;
    var panel=document.getElementById(panelId);
    if(!panel){panel=document.createElement('section');panel.id=panelId;panel.className='no-print';panel.setAttribute('aria-label','GES Teacher Assessment controls');host.parentNode.insertBefore(panel,host);}
    if(panel.dataset.context===key&&panel.dataset.kind===kind&&panel.querySelectorAll('[data-comment]').length===5){syncPreview(kind,host,panel);return;}
    panel.dataset.context=key;panel.dataset.kind=kind;
    panel.innerHTML='<h3>GES Teacher Assessment selections</h3><p>Select a sentiment and one comment for each category. Only the selected comment appears on the result slip.</p><div class="ges-assessment-grid">'+categories.map(function(c){return '<fieldset data-category="'+c.key+'"><legend>'+esc(c.label)+'</legend><label>Sentiment<select data-sentiment="'+c.key+'"><option value="positive">Positive</option><option value="negative">Negative</option></select></label><label>Selected comment<select data-comment="'+c.key+'"><option value="">Choose a comment</option></select></label></fieldset>'}).join('')+'</div>'+(kind==='mock'?categories.map(function(c){return '<input type="hidden" id="gmr-'+({ctRemarks:'ctrem',htRemarks:'htrem'}[c.field]||c.field)+'">'}).join(''):'');
    var styleId='ges-assessment-style';if(!document.getElementById(styleId)){var style=document.createElement('style');style.id=styleId;style.textContent='.ges-assessment-panel{margin:1rem auto;max-width:1050px;padding:1rem;background:#f7f9fc;border:1px solid #d6deea;border-radius:10px}.ges-assessment-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}.ges-assessment-grid fieldset{min-width:0;border:1px solid #d6deea;padding:.65rem;display:grid;grid-template-columns:minmax(110px,.55fr) minmax(180px,1fr);gap:.6rem}.ges-assessment-grid label{display:grid;gap:.25rem;font-size:.82rem}.ges-assessment-grid select{width:100%;min-height:42px;padding:.45rem;border:1px solid #b8c7db;border-radius:6px;background:#fff}@media(max-width:640px){.ges-assessment-grid{grid-template-columns:1fr}.ges-assessment-grid fieldset{grid-template-columns:1fr}}@media print{.ges-assessment-panel{display:none!important}}';document.head.appendChild(style)}
    panel.classList.add('ges-assessment-panel');
    categories.forEach(function(c){
      var saved=state[c.key]||{}, sentiment=panel.querySelector('[data-sentiment="'+c.key+'"]'), comment=panel.querySelector('[data-comment="'+c.key+'"]');sentiment.value=saved.sentiment||'positive';
      var existing=kind==='mock'?slip.querySelector('[data-ges-comment="'+c.field+'"]'):slip.querySelector('#'+c.id);
      var value=existing?(existing.value||existing.textContent||''):''; if(saved.comment&&all[c.key][sentiment.value].indexOf(saved.comment)>=0)value=saved.comment;
      function fill(){var list=all[c.key][sentiment.value]||[];comment.innerHTML='<option value="">Choose a comment</option>'+list.map(function(t){return '<option value="'+esc(t)+'">'+esc(t)+'</option>'}).join('');if(value&&list.indexOf(value)>=0)comment.value=value;}
      function put(text){value=text;state[c.key]={sentiment:sentiment.value,comment:text};writeState(key,state);var target=slip.querySelector('[data-ges-comment="'+c.field+'"]');if(target)target.textContent=text;var storeId=kind==='mock'?'gmr-'+({ctRemarks:'ctrem',htRemarks:'htrem'}[c.field]||c.field):c.id;var stored=panel.querySelector('#'+storeId);if(stored)stored.value=text;
        if(kind==='exam'&&typeof window.saveSlipRemarks==='function'){var examHidden=panel.querySelector('#'+c.id);setSelectValue(examHidden,text);window.saveSlipRemarks(document.getElementById('slip-index')?.value||'');}
        if(kind==='mock'&&window.GES_MOCK_RESULT&&typeof window.GES_MOCK_RESULT.saveRemarks==='function')window.GES_MOCK_RESULT.saveRemarks();
      }
      fill();
      var storeId=kind==='mock'?'gmr-'+({ctRemarks:'ctrem',htRemarks:'htrem'}[c.field]||c.field):c.id;var stored=panel.querySelector('#'+storeId);if(stored)stored.value=value;
      sentiment.addEventListener('change',function(){var prior=comment.value;value=(all[c.key][sentiment.value]||[]).indexOf(prior)>=0?prior:'';fill();put(value)});
      comment.addEventListener('change',function(){put(comment.value)});
      if(existing&&existing.tagName==='SELECT'){
        var originalValue=existing.value;
        var group=existing.closest('.slip-rem-group');if(group){var label=group.querySelector('.slip-rem-label');group.innerHTML='';if(label)group.appendChild(label);var preview=document.createElement('span');preview.dataset.gesComment=c.field;preview.className='ges-selected-comment';preview.textContent=value;group.appendChild(preview);}
        existing.classList.add('ges-assessment-storage');existing.setAttribute('aria-hidden','true');existing.tabIndex=-1;existing.style.cssText='position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important';panel.appendChild(existing);
        setSelectValue(existing,originalValue);
      }
      if(!existing){var slot=slip.querySelector('[data-ges-comment="'+c.field+'"]');if(!slot){slot=document.createElement('span');slot.dataset.gesComment=c.field;slot.className='ges-selected-comment';slip.appendChild(slot);}slot.textContent=value;}
      else if(existing.tagName==='SELECT'){setSelectValue(existing,value);if(kind==='exam'){var display=slip.querySelector('#'+c.id+'-disp');if(display){display.remove();}}}
    });
  }
  function syncPreview(kind,host,panel){
    var slip=host&&host.querySelector('.result-slip');if(!slip)return;
    var state=readState(panel.dataset.context);
    categories.forEach(function(c){
      var saved=state[c.key]||{},target=slip.querySelector('[data-ges-comment="'+c.field+'"]');
      var storeId=kind==='mock'?'gmr-'+({ctRemarks:'ctrem',htRemarks:'htrem'}[c.field]||c.field):c.id;
      var legacy=panel.querySelector('#'+storeId);
      if(kind==='exam'){
        // Result renderers replace their slip DOM. Re-adopt the fresh native
        // select so saveSlipRemarks reads the current result rather than the
        // detached select from the previous render.
        var current=slip.querySelector('#'+c.id);
        if(current&&current!==legacy){
          var value=saved.comment||current.value||legacy&&legacy.value||'';
          if(legacy&&legacy.parentNode)legacy.remove();
          var group=current.closest('.slip-rem-group');
          if(group){
            var label=group.querySelector('.slip-rem-label');
            var display=group.querySelector('#'+c.id+'-disp');
            if(display)display.remove();
            current.remove();
            var preview=group.querySelector('[data-ges-comment="'+c.field+'"]');
            if(!preview){preview=document.createElement('span');preview.dataset.gesComment=c.field;preview.className='ges-selected-comment';group.appendChild(preview);}
            preview.textContent=value;
            if(label&&label.parentNode!==group)group.insertBefore(label,group.firstChild);
          }
          setSelectValue(current,value);current.classList.add('ges-assessment-storage');
          current.setAttribute('aria-hidden','true');current.tabIndex=-1;
          current.style.cssText='position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important';
          panel.appendChild(current);legacy=current;
        }
      }
      var text=saved.comment||legacy&&legacy.value||'';
      if(target&&target.textContent!==text)target.textContent=text;
      if(legacy&&legacy.value!==text)setSelectValue(legacy,text);
    });
  }
  function scan(){var exam=document.getElementById('slip-container'),mock=document.getElementById('gmr-slip-container');if(exam&&exam.querySelector('.result-slip'))mount('exam',exam);if(mock&&mock.querySelector('.result-slip'))mount('mock',mock);}
  window.GESTeacherAssessment={categories:categories,comments:all,newComments:additions,scan:scan,contextFor:contextFor};
  refreshLibrary();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
  window.addEventListener('edutrack:legacy-modules-activated',scan);
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
})(window,document);
