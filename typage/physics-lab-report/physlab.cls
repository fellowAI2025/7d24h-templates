%% physlab.cls - Chinese physics lab report (物理实验报告).
%% Written by 7D24H for the 7d24h-templates repository. CC0-1.0: no rights
%% reserved; copy, change and redistribute it freely.
%%
%% Header like the university paper form: school name and a blue spaced
%% "物理实验报告" title, rows of underlined fields, and (option `boxed`, the
%% default) a frame around the report body on every page.
%%
%% Fields (preamble): \title (实验名称) \author (学生姓名) \date (实验时间)
%%   \school \reporttitle \studentid \classname \partner \expno \cabinet
%%   \room \grade
%% Options: boxed | plain, and any ctexart option (zihao=..., fontset=...).
\NeedsTeXFormat{LaTeX2e}[2020/10/01]
\ProvidesClass{physlab}[2026/10/30 v1.0 Physics lab report (7D24H)]

\newif\ifphyslab@boxed
\physlab@boxedtrue
\DeclareOption{boxed}{\physlab@boxedtrue}
\DeclareOption{plain}{\physlab@boxedfalse}
\PassOptionsToClass{UTF8,fontset=fandol,zihao=-4,a4paper}{ctexart}
\DeclareOption*{\PassOptionsToClass{\CurrentOption}{ctexart}}
\ProcessOptions\relax
\LoadClass{ctexart}

\RequirePackage[a4paper,left=2.5cm,right=2.5cm,top=2.2cm,bottom=2.5cm,footskip=1.1cm]{geometry}
\RequirePackage{xcolor}
\definecolor{physlabblue}{RGB}{38,58,168}

%% ---- Fields -------------------------------------------------------------
\def\physlab@school{}
\def\physlab@reporttitle{物理实验报告}
\def\physlab@studentid{}
\def\physlab@classname{}
\def\physlab@partner{}
\def\physlab@expno{}
\def\physlab@cabinet{}
\def\physlab@room{}
\def\physlab@grade{}
\newcommand\school[1]{\def\physlab@school{#1}}
\newcommand\reporttitle[1]{\def\physlab@reporttitle{#1}}
\newcommand\studentid[1]{\def\physlab@studentid{#1}}
\newcommand\classname[1]{\def\physlab@classname{#1}}
\newcommand\partner[1]{\def\physlab@partner{#1}}
\newcommand\expno[1]{\def\physlab@expno{#1}}
\newcommand\cabinet[1]{\def\physlab@cabinet{#1}}
\newcommand\room[1]{\def\physlab@room{#1}}
\newcommand\grade[1]{\def\physlab@grade{#1}}

%% A label followed by an underlined blank of fixed width holding the value.
\newcommand\physlab@field[3]{%
  #1\hspace{0.2em}%
  \rlap{\rule[-0.4ex]{#2}{0.5pt}}\makebox[#2]{#3}}

%% ---- Header and frame -----------------------------------------------------
%% The header has a fixed height, so the frame on its page starts right below
%% it; on the other pages the frame surrounds the whole text area.
\newlength\physlab@headerheight
\setlength\physlab@headerheight{38mm}
\newlength\physlab@pad
\setlength\physlab@pad{3mm}
\newlength\physlab@rule
\setlength\physlab@rule{0.6pt}
\newif\ifphyslab@headerpage

\newcommand\physlab@header{%
  \vbox to \physlab@headerheight{%
    \hsize=\textwidth \parindent=0pt \parskip=0pt
    \vspace*{1mm}%
    \centerline{%
      {\songti\Large\ziju{0.25}\physlab@school}\hspace{1.5em}%
      {\heiti\bfseries\LARGE\color{physlabblue}\ziju{0.9}\physlab@reporttitle}}%
    \vspace{5mm}%
    {\small
      \physlab@field{学生姓名}{6.5em}{\@author}\hfill
      \physlab@field{学号}{7.5em}{\physlab@studentid}\hfill
      \physlab@field{班级}{7em}{\physlab@classname}\hfill
      \physlab@field{成绩}{4.5em}{\physlab@grade}\par
      \vspace{3mm}%
      \physlab@field{实验时间}{9em}{\@date}\hfill
      \physlab@field{同组者}{6.5em}{\physlab@partner}\hfill
      \physlab@field{教师签字}{6em}{}\par
      \vspace{3mm}%
      \physlab@field{报告柜号}{6em}{\physlab@cabinet}\hfill
      \physlab@field{实验房间号}{6em}{\physlab@room}\par}%
    \vfil}}

\renewcommand\maketitle{%
  \par
  \global\physlab@headerpagetrue
  \nointerlineskip
  \physlab@header
  \vspace{4mm}%
  {\noindent
    \physlab@field{实验名称：}{18em}{\@title}\hfill
    \physlab@field{实验编号：}{4em}{\physlab@expno}\par}%
  \vspace{2mm}%
  \global\let\maketitle\relax}

\newcommand\physlab@frame{%
  \begingroup
  \setlength\unitlength{1pt}%
  \dimen0=\dimexpr 1in+\hoffset+\oddsidemargin-\physlab@pad\relax
  \dimen2=\dimexpr \textwidth+2\physlab@pad\relax
  \dimen4=\dimexpr 1in+\voffset+\topmargin+\headheight+\headsep\relax
  \ifphyslab@headerpage
    \advance\dimen4 by \physlab@headerheight
  \else
    \advance\dimen4 by -\physlab@pad
  \fi
  \dimen6=\dimexpr 1in+\voffset+\topmargin+\headheight+\headsep+\textheight+\physlab@pad\relax
  \dimen8=\dimexpr \dimen6-\dimen4\relax
  \put(\strip@pt\dimen0,-\strip@pt\dimen6){\rule{\dimen2}{\physlab@rule}}%
  \put(\strip@pt\dimen0,-\strip@pt\dimen4){\rule{\dimen2}{\physlab@rule}}%
  \put(\strip@pt\dimen0,-\strip@pt\dimen6){\rule{\physlab@rule}{\dimen8}}%
  \put(\strip@pt\dimexpr\dimen0+\dimen2-\physlab@rule\relax,-\strip@pt\dimen6){\rule{\physlab@rule}{\dimen8}}%
  \endgroup}

\ifphyslab@boxed
  \AddToHook{shipout/background}{\physlab@frame}
\fi
\AddToHook{shipout/after}{\global\physlab@headerpagefalse}

%% ---- Headings: 一、 / （1） ------------------------------------------------
\ctexset{
  section = {
    name = {,、},
    number = \chinese{section},
    aftername = {},
    format = \heiti\large\raggedright,
    beforeskip = 2.2ex plus .5ex minus .2ex,
    afterskip = 1.2ex plus .2ex,
  },
  subsection = {
    name = {（,）},
    number = \arabic{subsection},
    aftername = {},
    format = \heiti\normalsize\raggedright,
    beforeskip = 1.5ex plus .4ex minus .2ex,
    afterskip = .8ex plus .2ex,
  },
}

\pagestyle{plain}
\endinput
