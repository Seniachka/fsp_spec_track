"""Карта навыков по должностям из data/hh_it_vacancies.json → data/skill_map.json.

Навык засчитывается вакансии один раз, если он встретился в названии, в key_skills
или в тексте карточки. Доля = число вакансий ячейки с навыком / число вакансий ячейки.
"""

from __future__ import annotations

import json
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "data" / "hh_it_vacancies.json"
OUT = ROOT / "data" / "skill_map.json"

GRADE_ORDER = ["intern", "junior", "middle", "senior", "lead"]

# code, title, category, regex (ищется в нижнем регистре)
HARD = [
    # языки
    ("python", "Python", "language", r"\bpython\b|питон"),
    ("go", "Go", "language", r"\bgo\b(?!\s*(to|live|ahead))|\bgolang\b"),
    ("java", "Java", "language", r"\bjava\b(?!\s*script)"),
    ("kotlin", "Kotlin", "language", r"\bkotlin\b|\bkoltin\b"),
    ("csharp", "C# / .NET", "language", r"\bc#|\.net\b|\bdotnet\b|asp\.net|entity framework"),
    ("php", "PHP", "language", r"\bphp\b"),
    ("cpp", "C / C++", "language", r"\bc\+\+|\bc/c\+\+|\bси\b(?! )|\bcmake\b"),
    ("javascript", "JavaScript", "language", r"\bjavascript\b|\bjs\b|\bes6\b|\bes20\d\d\b|\becmascript\b"),
    ("typescript", "TypeScript", "language", r"\btypescript\b|\bts\b"),
    ("swift", "Swift", "language", r"\bswift\b|\bswiftui\b|\buikit\b|\bobjective-c\b"),
    ("dart", "Dart", "language", r"\bdart\b"),
    ("ruby", "Ruby", "language", r"\bruby\b|\brails\b"),
    ("rust", "Rust", "language", r"\brust\b"),
    ("scala", "Scala", "language", r"\bscala\b"),
    ("bash", "Bash и shell", "language", r"\bbash\b|\bshell\b|\bsh\b|скрипт\w* (на )?bash|shell-скрипт"),
    ("powershell", "PowerShell", "language", r"\bpowershell\b"),
    ("sql", "SQL", "language", r"\bsql\b(?!\s*server)|\bt-sql\b|\bpl/?sql\b|\bджойн"),
    # backend-фреймворки и платформы
    ("fastapi", "FastAPI", "framework", r"\bfastapi\b|\buvicorn\b|\bstarlette\b"),
    ("django", "Django / Flask", "framework", r"\bdjango\b|\bflask\b|\bdrf\b"),
    ("asyncio", "Асинхронность и async/await", "concept", r"\basyncio\b|\basync/await\b|\bawait\b|асинхрон|\bpromise\b|\bпромис"),
    ("spring", "Spring", "framework", r"\bspring\b|\bhibernate\b|\bjvm\b"),
    ("laravel", "Laravel / Symfony / Yii", "framework", r"\blaravel\b|\bsymfony\b|\byii\b|\bbitrix\b|битрикс"),
    ("nodejs", "Node.js", "framework", r"\bnode\.?js\b|\bnestjs\b|\bexpress\b|\bnode\b"),
    ("orm", "ORM и миграции", "concept", r"\borm\b|\bsqlalchemy\b|\balembic\b|\bmigrat|миграци|\bgorm\b|\bprisma\b|\btypeorm\b|\bjpa\b"),
    ("rest", "REST API", "concept", r"\brest\b|\brestful\b|\bопенапи|\bopenapi\b|\bswagger\b|\bapi\b"),
    ("http", "HTTP и сети веба", "concept", r"\bhttp\b|\bhttps\b|\bcookie|\bcors\b|\bwebsocket|\bвеб-сокет"),
    ("grpc", "gRPC и Protobuf", "concept", r"\bgrpc\b|\bprotobuf\b|\bproto\b"),
    ("graphql", "GraphQL", "concept", r"\bgraphql\b"),
    ("microservices", "Архитектура приложений и микросервисы", "concept", r"микросервис|\bmicroservice|архитектур\w* (сервис|приложен|систем|по|backend|бэкенд|решени|проект|платформ)|\bархитектурн|\bddd\b|\bevent-driven\b|событийн\w* архитектур|\bsaga\b|\bcqrs\b|\bsoa\b|\bмонолит|\bsystem design\b|проектировани\w* (систем|сервис|api)"),
    ("oop", "ООП, SOLID и паттерны", "concept", r"\bооп\b|\boop\b|\bsolid\b|паттерн|design pattern|\bgof\b|объектно-ориентир|\bdry\b|\bkiss\b"),
    ("algorithms", "Алгоритмы и структуры данных", "concept", r"алгоритм|структур\w* данных|сложност\w* алгоритм|\bbig-?o\b|\bleetcode\b"),
    ("concurrency", "Многопоточность и конкурентность", "concept", r"многопоточн|конкурентн\w* (доступ|программ|выполнен|код|запрос)|\bconcurren|\bgoroutine|\bгорутин|\bмногопоточ|\bthread(ing|s|-safe)?\b|\bcoroutine|\bкорутин|\bmutex\b|\block-free\b|\bпоток\w* выполнен|\bрасе condition|\bгонк"),
    ("unit-testing", "Юнит-тесты и TDD", "concept", r"\bunit[- ]?test|юнит-тест|модульн\w* тест|\bpytest\b|\bjunit\b|\btdd\b|\bmock|покрыти\w* (кода )?тест|\bunittest\b|\btestify\b|\bxunit\b|\bnunit\b|\bphpunit\b|\brspec\b|\bпокрыти\w* кода"),
    ("performance", "Производительность и оптимизация", "concept", r"производительност|\bperformance\b|\bпрофилир|\bprofil(e|ing)\b|\bвысоконагруж|\bhighload\b|\bвысок\w* нагрузк|\bоптимизац\w* (кода|производительност|скорост|памяти)|\bузк\w* мест|\bbottleneck"),
    ("incident-management", "Инциденты, on-call и надёжность", "concept", r"инцидент|\bon-?call\b|\bдежурств|\bпостмортем|\bpost-?mortem|\bsla\b|\bslo\b|\bsli\b|\bотказоустойчив|\bдоступност\w* (сервис|систем)|\bdisaster recovery\b|\bбэкап|\bбекап|\bрезервн\w* копи|\bfault[- ]tolera|\bнадёжност|\bнадежност"),
    ("release-management", "Релизы и управление версиями", "concept", r"\bрелиз|\brelease\b|\bсемвер|\bsemver\b|\bверсионир|\bfeature ?flag|\bфича-флаг|\bканаре|\bcanary\b|\bblue-green\b|\bоткат\w* (релиз|верси|изменен)|\brollback"),
    ("git", "Git и код-ревью", "tooling", r"\bgit\b|\bgithub\b|\bgitlab\b(?!\s*ci)|\bbitbucket\b|\bgit ?flow\b|код-ревью|code review|\bревью\b|\bpull request|\bmerge request"),
    ("linux", "Linux", "infra", r"\blinux\b|\bubuntu\b|\bdebian\b|\bcentos\b|\brhel\b|\balt linux\b|\bастра\b|\bastra\b|\bunix\b"),
    ("docker", "Docker и контейнеры", "infra", r"\bdocker\b|\bcontainerd\b|\bpodman\b|контейнер"),
    ("kubernetes", "Kubernetes", "infra", r"\bkubernetes\b|\bk8s\b|\bhelm\b|\bopenshift\b|\bистио|\bistio\b|\bкубер"),
    ("cicd", "CI/CD", "infra", r"\bci/?cd\b|\bgitlab ci\b|\bjenkins\b|\bteamcity\b|\bgithub actions\b|\bcircleci\b|\bargo ?cd\b|\bпайплайн|\bpipeline"),
    ("ansible", "Ansible и конфигурация", "infra", r"\bansible\b|\bpuppet\b|\bchef\b|\bsaltstack\b|\bsalt\b"),
    ("terraform", "Terraform и IaC", "infra", r"\bterraform\b|\biac\b|infrastructure as code|\bpulumi\b"),
    ("monitoring", "Мониторинг и логи", "infra", r"\bprometheus\b|\bgrafana\b|\bzabbix\b|\belk\b|\belastic\w*\b|\bkibana\b|\bloki\b|\bvictoria ?metrics\b|\bмониторинг|\balert|\bалерт|\bsentry\b|\bopentelemetry\b|\bjaeger\b|логир"),
    ("nginx", "Nginx и балансировка", "infra", r"\bnginx\b|\bhaproxy\b|\btraefik\b|\benvoy\b|балансиров|\breverse proxy\b"),
    ("networking", "Сети: TCP/IP, DNS, VPN", "infra", r"\btcp/?ip\b|\bdns\b|\bdhcp\b|\bvlan\b|\bvpn\b|\bosi\b|\bnat\b|\bbgp\b|\bospf\b|сетев\w* (взаимодейств|протокол|оборудован|технолог)|локальн\w* сет|\bроутинг|\bмаршрутизац|\bfirewall\b|межсетев"),
    ("virtualization", "Виртуализация", "infra", r"\bkvm\b|\bvmware\b|\bproxmox\b|\bhyper-v\b|\bvsphere\b|виртуализац|\bqemu\b"),
    ("cloud", "Облака", "infra", r"\baws\b|\bazure\b|\bgcp\b|\byandex cloud\b|\bоблак|\bcloud\b|\bs3\b|\bvk cloud\b|\bselectel\b"),
    ("windows-server", "Windows Server и Active Directory", "infra", r"\bwindows server\b|\bactive directory\b|\bgpo\b|администрирован\w* (серверов )?windows|\bдомен\w* (контроллер|windows)"),
    # базы и очереди
    ("postgresql", "PostgreSQL", "database", r"\bpostgres\w*\b|\bpsql\b"),
    ("mysql", "MySQL / MariaDB", "database", r"\bmysql\b|\bmariadb\b"),
    ("mssql", "MS SQL Server", "database", r"\bms ?sql\b|\bsql server\b|\bt-sql\b"),
    ("oracle", "Oracle", "database", r"\boracle\b|\bpl/sql\b"),
    ("clickhouse", "ClickHouse", "database", r"\bclickhouse\b"),
    ("greenplum", "Greenplum / Teradata / MPP", "database", r"\bgreenplum\b|\bteradata\b|\bvertica\b|\bmpp\b|\bexasol\b"),
    ("mongodb", "MongoDB и NoSQL", "database", r"\bmongo\w*\b|\bnosql\b|\bcassandra\b|\bdynamodb\b|\bcouch\w*\b"),
    ("redis", "Кеширование и Redis", "database", r"\bredis\b|\bmemcache\w*\b|\bкеш|\bкэш|\bcache\b|\bcaching\b"),
    ("elasticsearch", "Elasticsearch / OpenSearch", "database", r"\belasticsearch\b|\bopensearch\b|\bполнотекстов"),
    ("kafka", "Kafka", "messaging", r"\bkafka\b|\bкафк"),
    ("rabbitmq", "RabbitMQ и очереди сообщений", "messaging", r"\brabbit\w*\b|\bnats\b|\bamqp\b|\bочеред\w* сообщени|message (queue|broker)|\bброкер\w* сообщени|\bcelery\b"),
    ("db-design", "Проектирование БД и оптимизация запросов", "concept", r"индекс|нормализац|\bexplain\b|оптимизац\w* (sql[- ])?запрос|план\w* запрос|\btransact|транзакци|\bacid\b|проектирован\w* (бд|баз)|схем\w* (бд|данных|базы)|\bdwh\b|\bхранилищ"),
    # frontend
    ("react", "React", "framework", r"\breact\b(?!\s*native)|\bредакс|\bredux\b|\bzustand\b|\bmobx\b|\breact query\b|\btanstack\b|\bнекст|\bnext\.?js\b|\bhooks?\b|\bхук"),
    ("vue", "Vue", "framework", r"\bvue\b|\bvue\.?js\b|\bnuxt\b|\bpinia\b|\bvuex\b|composition api|\bvuetify\b"),
    ("angular", "Angular", "framework", r"\bangular\w*\b|\brxjs\b|\bngrx\b"),
    ("html-css", "HTML и CSS", "language", r"\bhtml\d?\b|\bcss\d?\b|вёрстк|верстк|\bsass\b|\bscss\b|\bless\b|\btailwind\b|\bflexbox\b|\bgrid\b|адаптивн|кроссбраузер|\bbem\b|\bбэм\b"),
    ("bundlers", "Сборка: Webpack, Vite", "tooling", r"\bwebpack\b|\bvite\b|\brollup\b|\besbuild\b|\bbabel\b|\bsws?c\b|\bnpm\b|\byarn\b|\bpnpm\b|сборщик"),
    ("js-testing", "Тестирование фронтенда", "concept", r"\bjest\b|\bvitest\b|\bcypress\b|\bplaywright\b|\btesting library\b|\bstorybook\b|\bvue test utils\b|\bkarma\b|\bjasmine\b"),
    ("web-perf", "Производительность и доступность веба", "concept", r"\bcore web vitals\b|\blighthouse\b|\bоптимизац\w* (загрузк|рендер|бандл)|\bssr\b|\bseo\b|доступност\w* (интерфейс|веб|сайт)|\ba11y\b|\bwcag\b|\blazy ?load|\bленив\w* загрузк|производительност\w* (фронт|интерфейс|веб|страниц|рендер|приложен)|\bcode ?splitting\b|\bбандл|\bbundle size\b|\bрендер"),
    ("browser", "Браузер: DOM, события, безопасность", "concept", r"\bdom\b|\bspa\b|\bpwa\b|\bservice worker|\bxss\b|\bcsrf\b|\bбраузер|\bevent loop\b|\bajax\b|\bfetch\b|\bwebgl\b|\bcanvas\b"),
    ("ui-ux", "UI/UX и работа с дизайном", "concept", r"\bfigma\b|\bui\b|\bux\b|\bдизайн-систем|\bмакет|прототипир|\bюзабилит|\busability\b"),
    # mobile
    ("android", "Android SDK", "framework", r"\bandroid\b|\bandroid sdk\b|\bandroid studio\b|\bjetpack\b|(?<!docker )(?<!docker-)\bcompose\b|\bgradle\b|\bretrofit\b|\broom (db|database)\b|\bwork ?manager\b|\bdagger\b|\bhilt\b|\bkoin\b"),
    ("ios", "iOS SDK", "framework", r"\bios\b|\bxcode\b|\bcocoapods\b|\bspm\b|\bcore ?data\b|\bapp store\b|\btestflight\b"),
    ("flutter", "Flutter", "framework", r"\bflutter\b|\bbloc\b|\briverpod\b"),
    ("react-native", "React Native", "framework", r"\breact native\b|\bexpo\b"),
    ("kmp", "Kotlin Multiplatform", "framework", r"\bkotlin multiplatform\b|\bkmp\b|\bkmm\b"),
    ("unity", "Unity и геймдев", "framework", r"\bunity\b|\bunreal\b|\bgamedev\b|геймдев|игров\w* движ"),
    ("mobile-arch", "Мобильная архитектура: MVVM, DI", "concept", r"\bmvvm\b|\bmvp\b|\bmvi\b|\bclean architecture\b|чист\w* архитектур|\bdi\b|dependency injection|\bвнедрени\w* зависимост"),
    ("mobile-release", "Публикация мобильных приложений", "concept", r"\bfastlane\b|\bgoogle play\b|\bapp store\b|\brustore\b|\btestflight\b|публикац\w* (приложен|в стор)|релиз\w* (мобильн|приложен)"),
    # данные и аналитика
    ("pandas", "Pandas и NumPy", "framework", r"\bpandas\b|\bnumpy\b|\bscipy\b|\bpolars\b"),
    ("statistics", "Статистика и A/B-тесты", "concept", r"статистик|\ba/?b[- ]?тест|\ba/b\b|\bab-?test|гипотез|доверительн\w* интервал|\bp-value\b|регрессионн\w* анализ|теори\w* вероятност"),
    ("data-viz", "Визуализация и BI", "tooling", r"\bpower bi\b|\btableau\b|\bsuperset\b|\bdatalens\b|\bmetabase\b|\bredash\b|\bqlik\b|\bbi\b|визуализац|\bmatplotlib\b|\bseaborn\b|\bplotly\b|дашборд|\bdashboard"),
    ("excel", "Excel и Google Sheets", "tooling", r"\bexcel\b|\bgoogle sheets\b|сводн\w* таблиц|\bvba\b|\bэксел"),
    ("etl", "ETL, Airflow и пайплайны данных", "concept", r"\betl\b|\belt\b|\bairflow\b|\bdbt\b|\bluigi\b|\bprefect\b|\bdagster\b|\bnifi\b|пайплайн\w* данных|витрин\w* данных|\bdata ?mart|\bdwh\b"),
    ("spark", "Spark и Hadoop", "framework", r"\bspark\b|\bpyspark\b|\bhadoop\b|\bhive\b|\bhdfs\b|\bpresto\b|\btrino\b|\bbig ?data\b|больш\w* данн"),
    ("data-analysis", "Анализ данных и метрики", "concept", r"анализ\w* данных|\bdata analy|продуктов\w* метрик|\bметрик|\bюнит-экономик|\bltv\b|\bretention\b|\bcohort|когорт|исследовательск\w* анализ|\beda\b|\bворонк"),
    ("system-analysis", "Системный анализ и требования", "concept", r"системн\w* анализ|анализ\w* требован|\bтз\b|техническ\w* задани|\buml\b|\bbpmn\b|\buse ?case|\bпользовательск\w* истори|\buser stor|бизнес-процесс|интеграц\w* (систем|решени)|спецификац"),
    ("math", "Математика для анализа данных", "concept", r"линейн\w* алгебр|математическ\w* (анализ|моделирован)|\bmathematics\b|\bматематик|дискретн\w* математик|теори\w* вероятност"),
    # ML
    ("ml-classic", "Классический ML", "concept", r"machine learning|машинн\w* обучен|\bml\b|\bsklearn\b|\bscikit-learn\b|\bxgboost\b|\bcatboost\b|\blightgbm\b|\bgradient boosting\b|бустинг|\bклассификац\w* (модел|задач)|\bмодел\w* (классификац|регресси)|\bрегресси\w* (модел|анализ)|\bлинейн\w* регресси|\bлогистическ\w* регресси|кластеризац|\bfeature engineering\b|\bscoring\b|\bскоринг"),
    ("deep-learning", "Нейросети и Deep Learning", "concept", r"\bpytorch\b|\btensorflow\b|\bkeras\b|\bdeep learning\b|нейронн\w* сет|нейросет|\bcnn\b|\btransformer|\bтрансформер"),
    ("nlp", "NLP и LLM", "concept", r"\bnlp\b|\bllm\b|\bgpt\b|\bbert\b|\blangchain\b|\blanggraph\b|\brag\b|\bprompt\b|\bпромпт|\bgenerative ai\b|генеративн|\bобработк\w* естественн|\bэмбеддинг|\bembedding"),
    ("cv", "Computer Vision", "concept", r"computer vision|компьютерн\w* зрен|\bopencv\b|\bdetection\b|\bдетекц|\bсегментац|\bocr\b"),
    ("recsys", "Рекомендательные системы и ранжирование", "concept", r"\brecsys\b|рекомендательн|\brecommend|\branking\b|ранжирован|\bпоиск\w* (релевант|ранжир)"),
    ("mlops", "MLOps и вывод моделей в прод", "concept", r"\bmlops\b|\bmlflow\b|\bkubeflow\b|\bmodel serving\b|\btriton\b|\bonnx\b|\bвывод\w* модел|\bинференс|\binference\b|\bfeature store\b"),
    # QA
    ("manual-testing", "Ручное тестирование и тест-дизайн", "concept", r"ручн\w* тестирован|функциональн\w* тестирован|регрессионн\w* тестирован|\bтест-кейс|\btest ?case|чек-лист|\bchecklist|тест-план|\btest ?plan|тест-дизайн|\bграничн\w* значен|\bэквивалентн|\bsmoke\b|\bсмоук|\bsanity\b|\bбаг-репорт|\bbug report|\bдефект"),
    ("api-testing", "Тестирование API", "concept", r"тестирован\w* api|\bpostman\b|\binsomnia\b|\bswagger\b|\bcharles\b|\bfiddler\b|\bproxyman\b|\bsoapui\b|\bjson\b|\bxml\b"),
    ("test-automation", "Автотесты: Selenium, Playwright, pytest", "concept", r"\bselenium\b|\bplaywright\b|\bcypress\b|\bappium\b|\bautotest|автотест|автоматизац\w* тестирован|\bpytest\b|\bjunit\b|\btestng\b|\bpage ?object\b|\bsdet\b|\bwebdriver\b|\bselenide\b"),
    ("load-testing", "Нагрузочное тестирование", "concept", r"нагрузочн\w* тестирован|\bjmeter\b|\bk6\b|\bgatling\b|\blocust\b|\byandex.tank\b|\bperformance test|тестирован\w* производительност|\bстабильност"),
    ("test-management", "Тест-менеджмент: Jira, TestRail", "tooling", r"\bjira\b|\btestrail\b|\btestit\b|\ballure\b|\bzephyr\b|\bconfluence\b|\bredmine\b|\byoutrack\b|\bqase\b|\bтест-менеджмент"),
    ("mobile-testing", "Тестирование мобильных приложений", "concept", r"тестирован\w* мобильн|мобильн\w* тестирован|\bappium\b|\badb\b|\bxcode\b|\bui тест"),
    ("security-testing", "Тестирование безопасности", "concept", r"тестирован\w* безопасност|\bowasp\b|\bburp\b|\bуязвимост"),
    # безопасность
    ("infosec-governance", "Нормативка ИБ: 152-ФЗ, 187-ФЗ, ФСТЭК, ГОСТ 57580", "concept", r"152-фз|187-фз|149-фз|63-фз|98-фз|фстэк|\bфсб\b|\bкии\b|\bзокии\b|\bпдн\b|защит\w* персональн\w* данн|\bиспдн\b|\bгост\b|57580|\bpci dss\b|\biso\w* 27001|\biso/iec\b|\b757-п\b|\b683-п\b|\b719-п\b|политик\w* (информационной )?безопасност|нормативн\w* (документ|акт|требован|баз)|\bкомплаенс|\bcompliance\b|регулятор\w* (требован|орган)|аудит\w* (информационной )?безопасност|\bаудит иб|\bорд\b|\bметодолог\w* (иб|информационной безопасност)|\bмодел\w* угроз|\bоценк\w* рисков иб|\bриск\w* информационной безопасност"),
    ("siem-soc", "SIEM, SOC и реагирование на инциденты", "concept", r"\bsiem\b|\bsoc\b|\bedr\b|\bxdr\b|\bsoar\b|\bmaxpatrol siem\b|\bkuma\b|\bqradar\b|\bsplunk\b|\barcsight\b|\bинцидент\w* (иб|информационной безопасност|безопасност)|\bреагирован\w* на инцидент|\bdfir\b|\bforensic|\bфорензик|\bthreat hunting\b|корреляц\w* событи|\bмониторинг (иб|событий)|\bioc\b|\bmitre\b|\batt&ck\b|\bрасследован\w* инцидент"),
    ("network-security", "Сетевая безопасность: NGFW, VPN, IDS", "concept", r"межсетев\w* экран|\bfirewall\b|\bngfw\b|\butm\b|\bids\b|\bips\b|\bvpn\b|\bvipnet\b|\bконтинент\b|\busergate\b|\bcheck ?point\b|\bfortinet\b|\bfortigate\b|\bcisco asa\b|\bpalo alto\b|сетев\w* (безопасност|атак)|\bwaf\b|\bddos\b"),
    ("endpoint-security", "Защита рабочих мест: антивирус, DLP, СЗИ от НСД", "concept", r"антивирус|\bkaspersky\b|\bksc\b|\bdlp\b|\bсзи\b|средств\w* защит\w* (информац|от нсд)|\bнсд\b|\bsecret net\b|\bdallas ?lock\b|\bастра\b|\bнсд\b|\bпак\b|\bsobol\b|\bсоболь\b"),
    ("appsec", "AppSec: OWASP, SAST/DAST, DevSecOps", "concept", r"\bappsec\b|application security|безопасн\w* разработк|\bowasp\b|\bsast\b|\bdast\b|\bsca\b|\bdevsecops\b|\bsecure sdlc\b|\bssdlc\b|\bуязвимост\w* (в коде|приложен)|\bsonarqube\b|\bsemgrep\b|\bcheckmarx\b|\bpt ai\b|\bsql-инъекц|\bsql injection\b|\bxss\b|\bcsrf\b|\bssrf\b|\bburp\b|\bzap\b|\bsecrets? management\b|\bvault\b"),
    ("vuln-management", "Управление уязвимостями и пентест", "concept", r"\bпентест|\bpentest|penetration|\bredteam|\bred team\b|сканер\w* (безопасност|уязвимост)|\bnessus\b|\bopenvas\b|\bmaxpatrol\b|\bqualys\b|\bредчек|\bredcheck\b|управлени\w* уязвимост|\bvulnerab|\bcve\b|\bcvss\b|\bexploit|\bэксплойт|\bmetasploit\b|\bnmap\b"),
    ("crypto", "Криптография, PKI и ЭП", "concept", r"криптограф|\bкриптопро\b|\bcryptopro\b|\bскзи\b|\bэцп\b|\bэп\b|электронн\w* подпис|\bpki\b|сертификат|\btls\b|\bssl\b|\bшифрован|\bencryption\b|\bгост (р )?34\b|\bhsm\b|\bудостоверяющ"),
    ("iam", "Управление доступом: IAM, MFA, PAM", "concept", r"\biam\b|\bidm\b|\bmfa\b|\b2fa\b|\bpam\b|\brbac\b|\bsso\b|\boauth|\boidc\b|\bopenid\b|\bsaml\b|\bldap\b|\bkeycloak\b|\bуправлени\w* доступ|\bучётн\w* запис|\bучетн\w* запис|\bпривилегирован|\bzitadel\b|\bjwt\b|\bаутентификац|\bавторизац"),
    # общее
    ("documentation", "Техническая документация", "concept", r"документац|\bтехнически\w* писател|\bconfluence\b|\badr\b|\breadme\b"),
    ("agile", "Процессы: Agile, Scrum, Kanban", "concept", r"\bagile\b|\bscrum\b|\bkanban\b|\bканбан|\bскрам|\bспринт|\bsprint\b|\bэджайл|\bгибк\w* методолог|\bретро\b|\bretro|\bбэклог|\bbacklog\b|\bгрумминг|\bplanning\b"),
    ("ai-tools", "ИИ-инструменты разработчика", "tooling", r"\bcopilot\b|\bchatgpt\b|\bcursor\b|\bai[- ]tools?\b|\bии-инструмент|\bии-ассистент|\bai-assisted\b|\bllm-инструмент|\bнейросет\w* (в работе|инструмент)"),
    ("english", "Английский язык", "language", r"английск|\benglish\b|\bintermediate\b|\bupper\b|\badvanced\b|\bb1\b|\bb2\b|\bc1\b"),
]

SOFT = [
    ("communication", "Коммуникация", r"коммуникаб|коммуникац|общени\w* с|договарива|\bумени\w* (чётко |четко )?(объясн|формулир|доносить)|грамотн\w* (устн|письменн|речь)|\bвзаимодейств\w* с (команд|бизнес|заказчик|коллег|смежн)"),
    ("teamwork", "Работа в команде", r"команд\w* игрок|работ\w* в команде|работать в команде|\bteamwork\b|\bteam player\b|команд\w* работ|\bколлег"),
    ("responsibility", "Ответственность", r"ответственн"),
    ("autonomy", "Самостоятельность", r"самостоятельн|\bпроактивн|\bинициатив|\bownership\b|\bне требу\w* (постоянн\w* )?контрол|\bдоводить (дела|задач)|\bавтономн"),
    ("attention", "Внимательность к деталям", r"внимательн|\bаккуратн|\bскрупул|\bпедантичн|\bвниман\w* к детал|\battention to detail"),
    ("analytical", "Аналитическое мышление", r"аналитическ\w* (мышлен|склад|способност)|\bструктурн\w* мышлен|\bсистемн\w* мышлен|\bкритическ\w* мышлен|\bлогическ\w* мышлен|\bумени\w* анализир|\bразбиратьс\w* в (сложн|новых|чужом)|\bдекомпоз"),
    ("learning", "Обучаемость и развитие", r"обучаем|\bбыстро (учит|осваив|разбир)|\bжелани\w* (учиться|развива|изуч|расти)|\bстремлени\w* к (развит|росту|обучен)|\bсамообуч|\bлюбознател|\bинтерес\w* к (новым|технолог|изучен)|\bготовност\w* (учиться|изуч|развива|осваив)"),
    ("time-management", "Планирование и управление временем", r"тайм-менеджмент|\btime management\b|\bпланирован|\bприоритиз|\bприоритет|\bсоблюден\w* срок|\bв срок\b|\bдедлайн|\bdeadline|\bмногозадачн|\bмультизадачн|\bоценк\w* (задач|сроков|трудо)|\bорганизован"),
    ("stress", "Стрессоустойчивость", r"стрессоустойчив|\bспокойн\w* в|\bв условиях (неопределённост|неопределенност|многозадачн|высок\w* нагруз)|\bгибкост|\bадаптивн"),
    ("result", "Ориентация на результат", r"ориентац\w* на результат|\bнацеленн\w* на результат|\bрезультативн|\bдостижен\w* (целей|результат)|\bдоводить до (результат|конца)"),
    ("mentoring", "Наставничество и развитие людей", r"наставничеств|\bбыть наставник|\bнаставник\w* для|\bроль наставник|\bменторств|\bментор\w* (джун|младш|новичк|стаж|команд)|\bобучени\w* (сотрудник|команд|коллег|джун|младш|новичк|стаж)|\bразвити\w* (сотрудник|команд|людей|инженер)|\bспособност\w* обучать|\bпроводить онбординг|\bонбордить|\bделитьс\w* (опытом|знаниям|экспертиз)|\bпередач\w* (опыта|знаний)|\bвыращива|\bрост\w* (членов )?команд"),
    ("leadership", "Лидерство и управление командой", r"лидерств|\bлидерск|\bуправлени\w* (командой|людьми|коллектив|разработк|отделом|группой)|\bруководств\w* (командой|коллектив|отдел|групп|направлен)|\bteam ?lead|\bteamleading|\bделегир|\bмотивац\w* (команд|сотрудник)|\bподбор\w* (персонал|сотрудник|команд|разработчик)|\bнайм\w* (команд|разработчик|сотрудник|людей)|\bпроводить собеседован|\bучасти\w* в (собеседован|найме)|\bпроведени\w* (собеседован|1:1|one-to-one|перформанс|performance review)|\bраспределени\w* (задач|нагруз)|\bорганизаторск|\bпостановк\w* задач (команде|разработчик|инженер)|\bконтрол\w* (сроков|выполнения задач команд)"),
    ("stakeholders", "Работа с заказчиком и стейкхолдерами", r"заказчик|\bстейкхолдер|\bstakeholder|\bбизнес-заказчик|\bс бизнесом|\bпрезентац|\bзащит\w* (решени|результат|проект)|\bпереговор|\bвыявлени\w* потребност|\bуправлени\w* ожидан|\bотстаива"),
    ("product-thinking", "Продуктовое мышление", r"продуктов\w* (мышлен|подход)|\bпонимани\w* (бизнес|продукт|потребност\w* пользоват)|\bценност\w* для (бизнес|пользоват|клиент)|\bбизнес-задач|\bбизнес-логик|\bвлияни\w* на (бизнес|продукт|метрик)"),
    ("quality", "Качество и инженерная культура", r"качеств\w* код|\bчист\w* код|\bclean code\b|\bbest practic|\bлучш\w* практик|\bстандарт\w* (кодирован|разработк)|\bподдерживаем\w* код|\bчитаем\w* код|\bинженерн\w* культур|\bтехническ\w* долг|\bрефакторинг"),
]

LEVELS = [
    (0.6, "core"),
    (0.4, "expected"),
    (0.2, "common"),
    (0.0, "rare"),
]

LEVEL_TITLES = {
    "core": "ядро: в большинстве вакансий",
    "expected": "ожидается: в заметной части вакансий",
    "common": "встречается",
    "rare": "редко",
}


def level_of(share: float) -> str:
    for threshold, name in LEVELS:
        if share >= threshold:
            return name
    return "rare"


def text_of(vacancy: dict) -> str:
    parts = [
        vacancy.get("title") or "",
        " ".join(vacancy.get("key_skills") or []),
        vacancy.get("requirements") or "",
        vacancy.get("nice_to_have") or "",
        vacancy.get("responsibilities") or "",
        vacancy.get("description") or "",
    ]
    return "\n".join(parts).lower()


def soft_text_of(vacancy: dict) -> str:
    """Софты считаем по требованиям и задачам. Блок «мы предлагаем» их только искажает."""
    parts = [vacancy.get("requirements") or "", vacancy.get("nice_to_have") or "", vacancy.get("responsibilities") or ""]
    text = "\n".join(part for part in parts if part).strip()
    if not text:
        text = vacancy.get("description") or ""
    return (vacancy.get("title", "") + "\n" + " ".join(vacancy.get("key_skills") or []) + "\n" + text).lower()


def compile_rules(rows):
    return [(code, title, category, re.compile(pattern, re.I)) for code, title, category, pattern in rows]


def main() -> None:
    source = json.loads(SRC.read_text(encoding="utf-8"))
    hard_rules = compile_rules(HARD)
    soft_rules = compile_rules([(code, title, "soft", pattern) for code, title, pattern in SOFT])

    spec_titles = {item["code"]: item["title"] for item in source["specializations"]}
    grade_titles = {item["code"]: item["title"] for item in source["grades"]}

    # vacancy_id -> set(skill codes)
    hard_hits: dict[int, set[str]] = {}
    soft_hits: dict[int, set[str]] = {}
    cells: dict[tuple[str, str], list[dict]] = {}
    for cell in source["cells"]:
        key = (cell["specialization"], cell["grade"])
        cells[key] = cell["vacancies"]
        for vacancy in cell["vacancies"]:
            text = text_of(vacancy)
            soft_text = soft_text_of(vacancy)
            hard_hits[vacancy["id"]] = {code for code, _t, _c, rx in hard_rules if rx.search(text)}
            soft_hits[vacancy["id"]] = {code for code, _t, _c, rx in soft_rules if rx.search(soft_text)}

    hard_meta = {code: {"code": code, "title": title, "category": category} for code, title, category, _ in HARD}
    soft_meta = {code: {"code": code, "title": title, "category": "soft"} for code, title, _ in SOFT}

    # агрегаты по специализации (все грейды вместе) — опора для ячеек с малым числом вакансий
    spec_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    spec_soft_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    spec_totals: dict[str, int] = defaultdict(int)
    for (spec, _grade), vacancies in cells.items():
        for vacancy in vacancies:
            spec_totals[spec] += 1
            for code in hard_hits[vacancy["id"]]:
                spec_counts[spec][code] += 1
            for code in soft_hits[vacancy["id"]]:
                spec_soft_counts[spec][code] += 1

    positions = []
    skill_usage: dict[str, dict] = defaultdict(lambda: {"positions": [], "mentions": 0})
    soft_usage: dict[str, dict] = defaultdict(lambda: {"positions": [], "mentions": 0})

    for spec in spec_titles:
        for grade in GRADE_ORDER:
            vacancies = cells.get((spec, grade), [])
            total = len(vacancies)
            counts: dict[str, int] = defaultdict(int)
            soft_counts: dict[str, int] = defaultdict(int)
            for vacancy in vacancies:
                for code in hard_hits[vacancy["id"]]:
                    counts[code] += 1
                for code in soft_hits[vacancy["id"]]:
                    soft_counts[code] += 1

            hard_rows = []
            codes = set(counts) | {code for code, n in spec_counts[spec].items() if n / max(spec_totals[spec], 1) >= 0.3}
            for code in codes:
                mentions = counts.get(code, 0)
                share = mentions / total if total else 0.0
                spec_share = spec_counts[spec].get(code, 0) / max(spec_totals[spec], 1)
                # итоговая оценка: ячейка весит больше, специализация сглаживает малую выборку
                weight = round(0.7 * share + 0.3 * spec_share, 3) if total else round(spec_share, 3)
                level = level_of(weight)
                hard_rows.append(
                    {
                        **hard_meta[code],
                        "mentions": mentions,
                        "share": round(share, 2),
                        "specialization_share": round(spec_share, 2),
                        "weight": weight,
                        "level": level,
                        "in_exam": level in {"core", "expected"},
                    }
                )
            hard_rows.sort(key=lambda row: (-row["weight"], -row["mentions"], row["title"]))

            soft_rows = []
            for code, mentions in soft_counts.items():
                share = mentions / total if total else 0.0
                spec_share = spec_soft_counts[spec].get(code, 0) / max(spec_totals[spec], 1)
                weight = round(0.7 * share + 0.3 * spec_share, 3)
                soft_rows.append(
                    {
                        **soft_meta[code],
                        "mentions": mentions,
                        "share": round(share, 2),
                        "specialization_share": round(spec_share, 2),
                        "weight": weight,
                        "level": level_of(weight),
                    }
                )
            soft_rows.sort(key=lambda row: (-row["weight"], row["title"]))

            for row in hard_rows:
                if row["in_exam"]:
                    skill_usage[row["code"]]["positions"].append(f"{spec}/{grade}")
                skill_usage[row["code"]]["mentions"] += row["mentions"]
            for row in soft_rows:
                if row["level"] in {"core", "expected"}:
                    soft_usage[row["code"]]["positions"].append(f"{spec}/{grade}")
                soft_usage[row["code"]]["mentions"] += row["mentions"]

            positions.append(
                {
                    "specialization": spec,
                    "specialization_title": spec_titles[spec],
                    "grade": grade,
                    "grade_title": grade_titles[grade],
                    "vacancies": total,
                    "vacancy_ids": [vacancy["id"] for vacancy in vacancies],
                    "hard_skills": hard_rows,
                    "soft_skills": soft_rows,
                    "exam_skills": [row["code"] for row in hard_rows if row["in_exam"]],
                }
            )

    skills = []
    for code, meta in hard_meta.items():
        usage = skill_usage.get(code, {"positions": [], "mentions": 0})
        skills.append({**meta, "exam_positions": usage["positions"], "mentions": usage["mentions"]})
    skills.sort(key=lambda row: (-len(row["exam_positions"]), -row["mentions"], row["title"]))

    soft_skills = []
    for code, meta in soft_meta.items():
        usage = soft_usage.get(code, {"positions": [], "mentions": 0})
        soft_skills.append({**meta, "exam_positions": usage["positions"], "mentions": usage["mentions"]})
    soft_skills.sort(key=lambda row: (-row["mentions"], row["title"]))

    document = {
        "source": "data/hh_it_vacancies.json",
        "built_at": datetime.now(timezone.utc).isoformat(),
        "method": (
            "Навык засчитывается вакансии один раз, если встретился в названии, key_skills или тексте. "
            "share — доля вакансий ячейки с навыком; specialization_share — доля по всем грейдам специализации; "
            "weight = 0.7·share + 0.3·specialization_share. Уровни: core ≥ 0.6, expected ≥ 0.4, common ≥ 0.2, rare < 0.2. "
            "В экзамен по должности входят навыки уровней core и expected."
        ),
        "levels": LEVEL_TITLES,
        "specializations": source["specializations"],
        "grades": source["grades"],
        "skills": skills,
        "soft_skills": soft_skills,
        "positions": positions,
    }
    OUT.write_text(json.dumps(document, ensure_ascii=False, indent=2), encoding="utf-8")

    print("skills", len(skills), "soft", len(soft_skills), "positions", len(positions))
    for position in positions:
        exam = [row["title"] for row in position["hard_skills"] if row["in_exam"]]
        softs = [row["title"] for row in position["soft_skills"] if row["level"] in {"core", "expected"}]
        print(f"\n{position['specialization']}/{position['grade']} ({position['vacancies']}): {', '.join(exam)}")
        print("   soft:", ", ".join(softs))


if __name__ == "__main__":
    main()
