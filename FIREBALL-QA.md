# Unicorn Fireball — QA F16, 2026-09-05

## Plazmowe duszki zamiast osobnego jądra

Zapłon zamienia każdego aktywnego unicorna w duszka w jego rzeczywistej
pozycji: poświata w kolorze bandy, jasny środek i krótki ogon za kierunkiem
ruchu. Nakładające się poświaty tworzą skupiska plazmy. Osobnego jądra nie ma.
Duszki unoszą się nisko (0,35–0,65 nad ziemią); dolną część ucina podłoże.
Efekt przypomina łączenie metaballi, ale nie używa progowania pola ani
nowego shadera. To nakładanie światła; z bliska duże skupiska nasycają biel.

Duszki korzystają z dotychczasowej symulacji podążania za liderem. Wypalenie
przywraca modele w aktualnych pozycjach. Wywrócone unicorny nie znikają:
ukrywane są tylko aktywne jednostki, które dostają plazmową reprezentację.
Sprawdzono sceny 35+ z przodu, z boku i zza gracza, również w ruchu,
w Chromium/SwiftShader. Brak błędów JavaScript. Bez zmian reguł walki.
Dodatkowo wykonano screenshoty w zwykłym oknie Google Chrome, z rendererem
`ANGLE Metal Renderer: Apple M4`, bez SwiftShader. Kontrolowane stado 33–35
leciało z prędkością 37; sprawdzono kamerę gracza, bok i przód. Brak błędów JS.
Pozostały problem wizualny: w pełnym ruchu nakładanie tęczowych pasów mocno
nasyca biel i zasłania duszki również na GPU. Duszki mają krótkie ogonki,
nie indywidualne smugi zapamiętujące tor lotu; długi ślad należy do tęczy.

Test pierwszej rozgrywki przeszedł: zapłon po 5,17 s z czterema
podwładnymi i pełnym zdrowiem; sterowanie aż do naturalnego wypalenia.

Zapłon dostał narastający sweep 180 → 3200 Hz przez 0,45 s oraz krótki szum.
Offline test miksu walki: peak 0,438, RMS 0,053, zero przesterowanych próbek.
Test nie zastępuje odsłuchu na rzeczywistych głośnikach.
Wyniki szerokiego QA i balansu F15 poniżej pozostają historyczne.

## Paczka F16

`npm run fireball:verify`: PASS — trzy uruchomienia końcowego ZIP-a.

ZIP **13 280 / 13 312 bajtów**, zapas **32**. Pięć kompresji O2:
13 287, 13 289, 13 280, 13 291, 13 283. Wszystkie mieszczą się w limicie.
HTML w ZIP-ie jest identyczny z `build/fireball/index.html` i
`play/unicorn-fireball.html`.

SHA-256 ZIP: `2881ed1d47b57e9b9aa4d734e258a23436e79a756fb53385d99bc38b283a7768`.

## Poprzednia runda QA — F15


## Zmieniona mechanika

Zwykłe taranowanie działa lokalnie: upadają unicorny w obszarze tęczy.
Trafienie lidera zabiera mu serce, ale nie rozrzuca odległych podwładnych.
Czołowa eksplozja nadal może rozbić całe przegrane stado.

Kolizja dwóch tęcz używa kierunku od środka jednej bandy do drugiej oraz
rzeczywistej prędkości zbliżania. Rozchodzące się bandy nie dostają kolejnego
impulsu. Eksplozja wymaga, by obie bandy były zwrócone przodem do miejsca
kontaktu (iloczyny kierunku i normalnej kontaktu co najmniej 0,65).
Samo przeciwne ustawienie kierunków przy bocznym otarciu nie wystarcza.

Przy bocznym kontakcie impuls wynosi:
`1.5 * closingSpeed / (1/massA + 1/massB)`, gdzie masa to podwładni + lider.
To odpowiednik zderzenia ze współczynnikiem restytucji 0,5: pęd wzdłuż
normalnej jest wymieniany, mniejsza banda reaguje mocniej. Zmieniane są
prędkości i kierunki obu tęcz; obie nadal płoną, bez utraty serc. Zachowano
0,6 s ochrony przed ponownym kontaktem. To model zręcznościowy dla okrągłych
obszarów kolizji, a nie dokładna fizyka brył każdego unicorna.

Zapalonej tęczy nie można anulować puszczeniem przycisku ani hamulcem.
Można skręcać. Tęcza kończy się po wypaleniu, czołowym clashu lub eliminacji.
Przed zapłonem puszczenie przerywa ładowanie, a hamulec nadal zatrzymuje bandę.
Niestabilność dużej bandy też prowadzi do nieanulowalnego zapłonu — trzeba
ją chłodzić wcześniej. Menu i pasek tęczy pokazują NO BRAKES; przy krawędzi
płonący gracz dostaje STEER NOW, a zwykły BRAKE & TURN.

Aby blokada nie oznaczała nieuniknionej śmierci, zwiększono sterowność przy
wysokim ładowaniu (mnożnik 1 - 0,4*charge zamiast 1 - 0,6*charge), pozostawiając
bezwładność zależną od liczebności. AI przewiduje granicę wcześniej podczas
płonięcia. Nie dodano automatycznej ochrony przed wypadnięciem.

## Dowody z testów reguł

22 testy obejmują między innymi:

- trafienie lidera i bliskiego podwładnego bez wywrócenia odległego;
- zachowanie pędu przy kontakcie bocznym oraz brak obrażeń i eksplozji;
- silniejsze odchylenie dla szybszego lub cięższego napastnika;
- przeciwne kierunki z kontaktem bocznym jako otarcie, nie eksplozję;
- brak ponownego impulsu dla rozchodzących się tęcz;
- nieanulowalny zapłon, naturalne wypalenie i późniejszy cooldown;
- bandę 10 uderzającą z boku w bandę 35 przy granicy: większa wypada mimo
  hamowania; w kontrolnym przebiegu bez uderzenia jej równoległa trasa jest bezpieczna;
- poprzednie regresje zbierania, NaN, pościgu, wyniku i uwalniania podwładnych.

## Balans

Walidacja końcowej fizyki, seedy 33–96, 64 rundy AI przy 30 krokach/s,
limit 420 s. Porównanie z F14 z poprzedniej rundy:

| Pomiar | F14 | F15 |
|---|---:|---:|
| Zakończone rundy | 64/64 | 64/64 |
| Średni czas | 84,9 s | 91,9 s |
| Mega clashe dwóch band 30+ | 1 | 2 |
| Wszystkie czołowe clashe | 77 | 97 |
| Największe stado | 57 | 55 |
| Wygrane mniej licznej bandy w ostatnim nierównym pojedynku | 6/61 | 9/63 |
| Śmierci na krawędzi / NaN | 0 / 0 | 0 / 0 |

`node tools/probe-fireball-balance.mjs --start=33 --count=64` odtwarza wynik.
Mega clashe: seedy 68 i 73. Małe różnice arytmetyki zmiennoprzecinkowej
mogą zmieniać przebieg długiej symulacji; tabela dotyczy końcowej wersji.

Wstępny zestaw 32 rund prototypu zakończył wszystkie rundy, z jednym upadkiem
na krawędzi. W losowym teście przeglądarkowym 24/24 rund się zakończyło, ale
pierwszy bot nie wygrał żadnej. Test dystrybucji korzystał z losowości także
zużywanej przez wcześniejsze renderowanie; ustalono seedy regresji zamiast
powtarzać losowania do uzyskania sukcesu. To nie zastępuje oceny balansu:
końcowa próba 64 seedów daje pierwszemu botowi 6 zwycięstw.
Ustalony zestaw przeglądarkowy zakończył 24/24 rund, z 4 wygranymi pierwszego
bota i średnim czasem 97 s. Testy sterowania, multiplayera, końca gry, audio
i pierwszej rozgrywki przeszły. Przy pierwszym zapłonie po około 5 s gracz
miał pełne zdrowie i przetrwał prowadzenie tęczy do wypalenia.

## Ograniczenia

Model nagradza celowanie w lidera, ataki boczne i przygotowanie toru szarży.
Nie dowiedziono jeszcze, że początkujący gracze odczytają te możliwości.
Wypychanie poza granicę sprawdzono w kontrolowanej scenie, nie jako częstość
wygrywającej taktyki ludzi. Duże clashe nadal są rzadkie; nie są wymuszane.

Chromium/SwiftShader i lokalny relay, bez fizycznego telefonu, Safari,
Firefoxa i publicznego relaya. Stan solo po śmierci nadal zatrzymuje grę.

## Paczka F15 (historyczna)

`npm run fireball:verify`: PASS — trzy uruchomienia końcowego ZIP-a.

ZIP **13 282 / 13 312 bajtów**, zapas **30**. Pięć kompresji O2:
13 282, 13 289, 13 289, 13 298, 13 297. Wszystkie mieszczą się w limicie.
O1 nie wystarczało; skrypty Fireball używają teraz O2. Oprócz kompresji
usunięto redundantne sprawdzanie trybu obserwatora w warunkach online HUD-u.
HTML w ZIP-ie jest identyczny z `build/fireball/index.html` i
`play/unicorn-fireball.html`.

SHA-256: `487c5bee59c274e54166d0705d5b9f04517ecd79b0a0c397587aaac65479197e`.
